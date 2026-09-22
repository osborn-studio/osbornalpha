## Scope and verdict

I read the ten files as given, statically. No P0 (nothing I can trace to an unauthenticated read/write, a cross-owner data path, or a silent acceptance of a revoked binding). The auth/RLS/binding spine holds up: `transaction()` rejects superuser/BYPASSRLS roles and re-checks `profiles.role`, `bindingFor` re-checks expiry and revocation under the owner lock on every path, `candidateFor` re-pins `approvedManifestHash`/rights/grant against the stored `imported` blob, and `prepareCandidate` never lets the uploaded document supply its own binding. A few things I specifically checked and found *not* to be bugs: `SELECT ... FOR UPDATE` in `candidateFor` is satisfied by the column-level `UPDATE` grants (`ExecCheckPermissionsModified` allows any-column when `updatedCols` is empty, exactly the FOR UPDATE case); the binding trigger's advisory lock hashes `user_id::text`, which matches `transaction()`'s lowercase-canonical input; and the tamper check does pin fully-acknowledged journal rows via `row.receipt_hash`.

The real damage is concentrated in `anchor.ts`, plus one scope leak in `decisions.ts`.

---

## P1

### 1. `drainOutbox` adopts unverified receipt fields for not-yet-acknowledged rows
`src/lib/research/s4/anchor.ts` → `drainOutbox`, verification loop.

The loop destructures `const {receipt_hash,...body}=entry` and verifies exactly five things against the DB: `sequence`, `owner_scope_hash`, `record_id`, `event_hash`, and the chain `previous_hash`. It never compares `record_kind`, `observation_hash`, `rule_hash`, `server_time`, or `provenance_level` against `row.event`, even though every one of those is present in `row.event`. `digest(body)!==receipt_hash` only proves the entry is internally self-consistent. The one thing that does pin the whole entry — `(row.receipt_hash && row.receipt_hash!==receipt_hash)` — is short-circuited whenever `row.receipt_hash IS NULL`.

Failure trace:
1. A drain appends entries for sequences 900–950 (`file.writeFile` + `file.sync` + directory fsyncs all complete), then the transaction aborts — process kill, `statement_timeout` firing on the `update public.research_s4_outbox`, pool connection drop, anything. The file is ahead of the DB; all 51 rows have `anchored_at IS NULL, receipt_hash IS NULL`. This is the documented, expected recovery state.
2. Anything with write access to the file in that window (same uid, a restore from a stale backup, an editor) rewrites entry 930's `observation_hash` and `rule_hash`, recomputes its `receipt_hash`, and re-links `previous_hash` for 931–950.
3. Next drain: every check passes. `event_hash` still matches `row.event_hash`, `digest(row.event)` still matches, `digest(body)` matches the new `receipt_hash`, the chain is intact, and `row.receipt_hash` is null so the pinning check is skipped.
4. The acknowledge branch then writes the tampered hash into the DB — `update ... set anchored_at=clock_timestamp(),receipt_hash=$3` with `entry.receipt_hash` — and for `kind==='Observation'` calls `addRecord(...,'AnchorReceipt',{receipt_hash:entry.receipt_hash,previous_hash:entry.previous_hash,...})` into the **immutable** record table. The forgery is now canonical and unretractable, and `drainOutbox` returns `{appended, acknowledged}` reporting success.

Fix: reconstruct the expected body from `row` (same code as the append branch, minus `exported_at`) and compare field-by-field, or at minimum compare `canonicalize({...body, exported_at:entry.exported_at})` against the reconstruction. Treat `exported_at` as the only entry-sourced field, and bound it (`row.event.server_time <= exported_at <= now`).

### 2. A single integrity failure poisons every observation the owner has, irreversibly
`src/lib/research/s4/anchor.ts` → `drainOutbox` catch block.

```
update public.research_s4_observation_state set anchor_status='integrity_failed',revision=revision+1
  where user_id=$1 and anchor_status<>'integrity_failed'
```

No predicate on which observation was implicated. Any `fail('anchor_integrity_failed')` marks **all** of the owner's observations, including ones anchored months earlier with valid receipts. Nothing sets `anchor_status` back: the only writer of `'anchored'` runs inside `if(!row.anchored_at)`, so already-acknowledged rows are never revisited and stay `integrity_failed` forever.

Three of the four triggers are not tampering at all:
- `stat.size>MAX_JOURNAL_BYTES` — the journal crossing 64 MiB. Growth is monotonic (no rotation, no truncation), so this is a scheduled event, not an accident.
- `!bytes.endsWith('\n')` — a torn `file.writeFile(line)` on crash. O_APPEND does not make a multi-KiB write atomic against power loss, and there is no truncate-to-last-good-newline recovery, so one crash permanently bricks the journal *and* the state table.
- `stat.uid!==process.getuid?.()` — note `process.getuid?.()` returns `undefined` on Windows, making this `stat.uid !== undefined`, i.e. always true, i.e. instant integrity failure. Same expression is in `controlledDirectory`.

Fix: scope the update to the observations actually covered by the failing sequence range; make `integrity_failed` operator-clearable; add journal rotation with a sealed-segment chain; and recover from a trailing partial line by truncating to the last newline rather than failing.

### 3. Read endpoints mint outbox rows, and the outbox has a hard lifetime cap
`src/lib/research/s4/read.ts` → `reviewHistory`, `citation`; `src/lib/research/s4/anchor.ts` → `drainOutbox`; `records.ts` → `addRecord`.

`drainOutbox` selects **all** outbox rows for the owner with `limit 100001` — no `anchored_at is null` filter — and `if(rows.length>100000) fail('input_limit')`. That's a cap on lifetime records, not pending ones, and rows are never deleted (runtime has no delete grant). Past 100 000, export fails permanently with a 500 (`input_limit` isn't in `s4Http`'s 413 list for... actually it is, 413 — but it is permanent regardless).

Meanwhile `reviewHistory` and `citation` are read operations that call `addRecord(...,'ExposureEvent',...)` with default options, so `options.outbox !== false` and each one inserts an outbox row plus an audit row. A UI that polls history, or an operator paging through citations, adds sequence numbers on every GET. Separately, one `revealCards` produces roughly 50 records (up to 10 fanout targets × ThesisRevision/InputSnapshot/JudgmentRun/Judgment/ChangeCard), so ~2 000 reveals alone reaches the cap.

Trace: user hits 100 001 lifetime outbox rows → next `drainOutbox` throws `input_limit` before any work → every subsequent decision's observation sits at `anchor_pending` forever → the append-only journal silently stops tracking the DB, with no alert because the failure surfaces as a generic export error. Also note the failing query materialises 100 001 rows of `select *` including full `event` jsonb before the length check.

Fix: paginate on `anchored_at is null` plus a bounded lookback for chain continuation (persist the last verified sequence + hash instead of re-reading the whole file); and either stop emitting outbox rows for display-only ExposureEvents or give them a separate non-anchored channel.

### 4. Synthetic candidates may bind real NYSE securities
`src/lib/research/s4/decisions.ts` → `submitDecision`.

```js
if(security?.metadata?.synthetic && !row.imported.synthetic) fail('scope_denied');
```

This is one-directional. It blocks a synthetic ticker on a real candidate, but permits a **real** ticker on a synthetic candidate — and per the brief all runtime material is authorized synthetic, so `row.imported.synthetic` is true for everything. `researchOptions` in `read.ts` hands the caller every active XNYS/NYSE USD ticker with no synthetic filter, so the selection is one click away.

The resulting Observation is internally contradictory: top-level `synthetic:row.imported.synthetic` (true) alongside `securities:[{...,synthetic:!!security.metadata?.synthetic}]` (false). S5 reads `pending_start` and resolves windows against a real instrument on a record sourced entirely from synthetic material — real market outcomes enter the evaluation set through the synthetic pipeline, which is the boundary S4 exists to hold.

Fix: `if (row.imported.synthetic !== !!security.metadata?.synthetic) fail('scope_denied')`, and filter `researchOptions.securities` by the caller's candidate scope.

### 5. `eligibility_at` precedes `frozen_at` with no invariant check
`src/lib/research/s4/decisions.ts` → `submitDecision`.

`eligibilityAt` is taken before the card/label/exposure lookups and the security/company queries; `frozenAt` is taken after. So `eligibility_at <= frozen_at` always, and the Observation persists `frozen_at:frozenAt, eligibility_at:eligibilityAt` — eligibility stamped *earlier* than the freeze. `planObservationSessions(frozenAt, eligibilityAt)` is then called with that pair and its output becomes `start_plan`.

I can't see `market-policy.ts`, so I can't confirm the parameter order is wrong. But the record as written admits a start plan anchored to a moment before the inputs were frozen, and nothing asserts otherwise. Since S5's entire job is to evaluate from `pending_start`, a window that can open before the freeze is a look-ahead channel. Fix: compute both from a single `serverTime` call, or assert `Date.parse(eligibility_at) >= Date.parse(frozen_at)` before constructing the observation.

### 6. `root` is an unvalidated absolute path (conditional on the caller)
`src/lib/research/s4/anchor.ts` → `drainOutbox`.

`if(!isAbsolute(root)) fail('scope_denied')` is the only constraint. `controlledDirectory` then does `mkdir(root,{recursive:true,mode:0o700})` — creating an arbitrary directory tree anywhere the process uid can write, then a `receipts.jsonl` under it. The doc comment says "One configured journal root per database," which implies config, but the parameter is threaded through from the caller and I don't have the route. If `root` is ever request-derived, an authenticated agent gets an arbitrary-directory-creation and file-creation primitive (contents are server-generated JSON, so the write itself is low-value; the directory creation and the ability to point a fresh empty journal at a populated outbox — which then re-appends everything under a new ZERO-rooted chain — are not). Fix: read the root from env inside `drainOutbox` and ignore any caller-supplied value, or check it against an allowlist.

---

## P2

**`anchor.ts`**
- Corrupted mid-file lines take a different path than trailing corruption: `parseStrict(line)` throws `invalid_schema`, which the catch block does *not* match, so genuine journal corruption produces a 422 and **no** integrity marking — inconsistent with the truncation case. Wrap the parse.
- `anchor_integrity_failed` is absent from every list in `s4Http`, so it is rewritten to `internal_error` / 500. The single most important error in the system is indistinguishable from a null-pointer.
- File I/O runs inside the DB transaction while holding the owner advisory lock: up to 500 appends × (1 `file.sync` + 3 directory `fsync`) = 2 000 fsyncs blocking every other operation for that owner. `dirname(root)` is fsynced unnecessarily and is never validated by `controlledDirectory`.
- If the catch-block `transaction()` throws (pool exhausted at `max:6`/`connectionTimeoutMillis:5000`), it masks the original integrity error.
- `controlledDirectory`/`drainOutbox` have a TOCTOU between `lstat` and `open`; `O_NOFOLLOW` covers the file but not the directory components.

**`db.ts`**
- `catch (e) { await db.query('rollback'); throw e; }` — if `rollback` throws on a dead connection, the original error is lost, and `finally { db.release() }` returns a possibly-broken connection to the pool. Use `db.release(e)` and guard the rollback.
- `/^[0-9a-f-]{36}$/` accepts `'-'.repeat(36)`; `set_config('request.jwt.claim.sub', ...)` then makes `auth.uid()`'s `::uuid` cast throw at policy-evaluation time → opaque 500. Fails closed, but use the real UUID pattern already defined in `decisions.ts`/`candidate.ts`.
- Malformed `ALPHA_S4_DATABASE_URL` throws `TypeError` from `new URL` → 500 instead of `not_configured`.
- `pool ??=` caches across env changes; `closeS4Pool` is never called from anything shown.

**`cards.ts`**
- `line.slice(0,1200)` slices UTF-16 units. If it lands between a surrogate pair, `Buffer.byteLength(text)` counts the lone surrogate as 3 bytes (U+FFFD) while the source holds a 4-byte sequence, so the recorded span is 1 byte short of a character boundary. `citation` then calls `new TextDecoder('utf-8',{fatal:true}).decode(...)` on a truncated sequence → raw `TypeError` → 500. Slice by code point, or by byte with a boundary check.
- `buildCards` early-returns `prior` rows shaped `{id,payload,payload_hash}`, while the fresh path returns `addRecord`'s `{id,kind,payload,payload_hash,recorded_at}`. `revealCards` spreads both into the response, so a re-reveal silently drops `kind` and `recorded_at`.
- Determinism is claimed but not delivered: the DB orders theses by `md5(id::text || $4)` while `selectFanout` orders by `digest([seed,a.id])` — two independent orderings over a `limit 101` cut. Also `digest(...).localeCompare(...)` is collation-dependent; use `<` on hex.
- `selectFanout`'s `random_omission_review` picks from `unmatched`, but `omitted` counts matched theses truncated past `slice(0,8)`. The audit control never reviews anything that was actually omitted.
- `[...row.imported.candidate.wiki_revision_refs]` and `.map` on `entity_candidates` are unguarded; if pack verification ever admits a missing field these become 500s.
- `saveRequest` stores the entire reveal response — every card payload — as the idempotency record. Unbounded jsonb growth per request key.

**`decisions.ts`**
- `exchange:'XNYS'` is hardcoded in the Observation's `securities[]`, but validation accepts `'NYSE'` and the InputSnapshot records `security.exchange` verbatim. The freeze snapshot and the observation disagree for every NYSE row.
- The `Review` record hardcodes `old_windows_preserved:true` while the Decision records `preserves_original_window:!makeObservation`. Direct contradiction whenever a new observation is created.
- `label.payload.evaluation_period_id!==period` → `exposure_required`: a reveal at Sunday 23:58 UTC and a decision at Monday 00:01 UTC is rejected with a 403 and no recovery except re-revealing (which itself adds `prior_related_exposure` contamination). Compare against the label's period rather than recomputing.

**`read.ts` / `http.ts`**
- `listCandidates` calls `bindingFor` per row, each doing its own `serverTime(db)` round trip — 200 round trips for 100 candidates, all under the owner lock.
- `reviewHistory` calls `serverTime(db)` twice and stamps `evaluation_period_id` and `displayed_at` from different reads.
- `bodyText`'s `TextDecoder(...,{fatal:true})` throws a raw `TypeError` on invalid UTF-8 → 500 rather than 422 `invalid_schema`.
- `source_unavailable` (raised in `prepareCandidate`) is in none of `s4Http`'s lists → 500 `internal_error`. Same for any future code.
- `e.message==='not authenticated'` string matching is brittle.

**`auth.ts`**
- `localSessionToken` accepts any `expiresAt` with no upper bound, and there's no `jti`/revocation table — a mis-minted long-lived token cannot be withdrawn short of rotating `ALPHA_S4_LOCAL_SESSION_SECRET`.
- `value.userId` is not type-checked at the boundary; it happens to be caught by `transaction`'s regex, but only because every entry point goes through `transaction`.
- CSRF for GET relies entirely on `sec-fetch-site: cross-site` being present. `reviewHistory` and `citation` are state-changing (they write ExposureEvents and outbox rows), so any client that omits the header gets a state-changing GET. Move those to POST or require the header's presence.

**`candidate.ts` / `import.ts`**
- `prepareCandidate` uses `const now = new Date()` — process wall clock — for `verifyCandidatePack`'s grant/rights expiry and all five timeline comparisons. `import.ts` only re-checks `ingested_at` against `serverTime`. A skewed host clock can admit an expired grant at import; `candidateFor`'s `authorize()` catches it on the next read, so the window is bounded, but the import receipt is already written.
- `const rawText = transport.files['source/' + version.snapshot_ref]` has no presence or type check before `rawText as string`. If pack verification ever doesn't cover it, `sha256(undefined)` and a NOT NULL violation follow.
- `import.ts` parses `raw` twice (once for `manifest.payload_digest`, once inside `prepareCandidate`) and uses the *unverified* copy's `pack_id` as the occurrence conflict key while storing the verified copy's `pack_id` in `data`. Equal in practice, but use `prepared.manifest.pack_id`.
- `research_s4_source_id` reuses any document with a matching `content_hash` regardless of whether it carries `s4_controlled_copy:true`, and never adds the marker. Identical content, so no new disclosure, but S4 material can end up in a document the restrictive policy doesn't cover.

**Migration**
- `research_s4_source_visible` is SECURITY DEFINER and reads `research_s4_candidates`/`research_s4_bindings`, both of which have `force row level security` with a single policy `TO alpha_s4_runtime`. If the function owner is not superuser and not BYPASSRLS (i.e. anywhere other than Supabase-hosted `postgres`), the function sees zero rows, always returns false, and every controlled copy becomes invisible — surfacing as `fail('hash_mismatch')` from `buildCards` and `citation`. Fails closed, but the diagnostic is actively misleading. Add an explicit policy for the function owner, or `SET LOCAL row_security = off` inside it.
- That same definer function is granted to `anon`. It returns false for anon (`auth.uid()` is null), but there is no reason to expose it.
- The `s4_controlled_copy` restrictive policy covers `SELECT` only. `research_s4_copy_marker` guards only the marker — not `raw_text` or `content_hash`. The entire provenance chain assumes `raw_text` is immutable; if any pre-existing grant gives the owner `UPDATE` on `research_source_documents`, they can rewrite it. `buildCards`/`citation` detect it via `sha256`, but already-materialised ChangeCard quotes do not. Extend the trigger to reject `raw_text`/`content_hash` changes when the marker is set.
- `research_s4_outbox` has no immutability trigger and grants `update(anchored_at,receipt_hash)` unconditionally. The `if(!row.anchored_at)` guard is application-level only. Add a trigger rejecting updates where `old.anchored_at is not null`.
- `research_s4_observation_state` likewise has no guard against `anchored → anchor_pending` transitions.
- `research_s4_outbox.sequence` is a single global identity across all owners, and the value is written into per-owner journals. Gaps in one owner's journal disclose another owner's record volume. Low impact for a single-tenant local deployment, but it is a cross-owner channel in an artifact designed to be exported.
- `research_source_occurrences.user_id` has no FK to `auth.users`, unlike every sibling table.
- `grant usage on schema auth to alpha_s4_runtime` is broader than the single `auth.uid()` the role needs.