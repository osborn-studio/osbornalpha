# Topic research operations · T0

## 1. Flags and switches

| Control | Operational effect |
| --- | --- |
| `TOPICS_ENABLED=1` | Enables the module on the server. With the flag unset, pages return 404, APIs return 404 `topics_disabled`, and authenticated cron calls return `{"skipped":"disabled"}`. Cron authentication runs first. |
| `topic_settings.public_enabled` | Defaults to false. Ordinary readers get 404 and public views expose zero rows. An authenticated admin can preview publications while the directory is closed. Opening the directory still requires a reader session. |
| `topic_settings.summary_public_enabled` | Defaults to false. Publishing with a summary requires this switch and provider clearance. Generation and approval are later-phase work. |
| `topic_source_licences.status` | Per-source register with `pending`, `approved`, and `revoked`. Licensed excerpts are later-phase work. Public evidence already inherits each resolver’s visibility and rights checks. |
| `TOPICS_E2E_FIXTURES=1` | Local fixture switch. Requires a non-production, non-Vercel process with no Supabase URL or service-role key configured. |

The research-chain link follows the environment flag immediately and the database switch within about 60 seconds. The latter read uses `unstable_cache` in `src/lib/topics/public-flag.ts`. Pages and APIs enforce access on the server even while navigation reflects an earlier read.

## 2. First enable · owner only

1. Apply `20261210090000_topics.sql`, then `20261210091000_topics_functions.sql`. After successful production application, merge the separate lock-only PR for `supabase/migrations.lock.json`.
2. Only the owner turns on `TOPICS_ENABLED`. Leave the directory closed. As admin, create a topic at `/admin/topics/new`, add evidence, save, run disclosure checks, resolve blockers, inspect the public preview and publish v1.
3. Read `GET /api/admin/topics/settings`. Inspect `required_attributions` and `problems` for the current published versions. Correct missing drawer, attribution or licence information in a replacement version. Re-read settings if a publication changes.
4. Only the owner confirms licences and opens `public_enabled`. Resolve FRED’s commercial-use terms for the intended product before confirming. Use a signed-in admin session, same-origin request and `Content-Type: application/json` for `POST /api/admin/topics/settings`. The example assumes exactly the two returned keys below. Supply every required key. The bracketed values are placeholders: the owner replaces each with the terms page actually read and the date it was read. Nobody else fills them in.

```json
{
  "public_enabled": true,
  "summary_public_enabled": false,
  "summary_provider_note": null,
  "licence_confirmations": {
    "macro:attribution": {
      "terms_url": "https://[FRED terms page the owner read]",
      "confirmed_on": "[YYYY-MM-DD the owner read it]"
    },
    "facts:sec": {
      "terms_url": "https://[SEC terms page the owner read]",
      "confirmed_on": "[YYYY-MM-DD the owner read it]"
    }
  }
}
```

Both booleans are required. Confirmation URLs must use HTTPS and dates must be valid calendar dates at or before today (UTC). Enabling summaries requires a nonblank provider note. Confirm a signed-in reader can open the directory and the published dossier.

**Emergency closure.** POST `{"public_enabled":false,"summary_public_enabled":false,"summary_provider_note":null,"licence_confirmations":{}}` to the same endpoint. Closing requires no confirmations. Use section 6 to withdraw one publication.

## 3. Register the crons · owner only

The owner adds these entries to the existing `crons` array in `vercel.json`. Times are UTC.

```json
[
  {"path":"/api/cron/topic-drift","schedule":"30 6 * * *"},
  {"path":"/api/cron/topic-verify","schedule":"0 7 * * 0"}
]
```

Drift checks run daily at 06:30 and persist a cursor across incomplete runs. Verification runs Sundays at 07:00 and samples up to 20 live versions per ISO week. Both routes declare a 300-second maximum and budget 250 seconds for work. Check scheduler history for authentication, code-version and completion failures.

## 4. Drift states

Open **详情** in the admin versions table to inspect ordinals, periods, values and check times.

| State | What the operator does |
| --- | --- |
| `unchanged` | Keep the published version. Continue scheduled checks. |
| `revised` | Compare frozen and current values in the source drawer. Review the change and publish a new version if the dossier needs updating. |
| `newer_period` | Inspect the new period. Update the draft when the dossier should cover it. |
| `now_withheld` | Verify current rights and confirm read-time masking in the dossier, drawer and replay. Withdraw the publication if its remaining content is unsuitable. |
| `retracted` | Check the source withdrawal and masking. Replace the evidence in a new version or withdraw the affected publication. |
| `unverifiable` | Inspect upstream identity, source availability and resolver failures. A missing lookup can produce this state. Recheck after recovery. |

A failed run retains the last successful completion time. Investigate the daily job if that time is missing or older than 72 hours. This warning is independent of publication age.

## 5. Replay mismatch

Use **核验** on a version or send `POST /api/admin/topics/[id]/versions/[n]/verify` with JSON `{}`. Read `matched`, `skipped` and the `mismatched` ordinals. Verification skips frozen non-ok and currently restricted or retracted evidence. A match chip can therefore include skipped rows.

For a mismatch, inspect the `replay_verify` audit event and open `dq_quarantine` entries for dataset `topics.replay`, producer `topic-verify`, reason `replay_mismatch`. The natural key is the version UUID followed by a colon and ordinal. Ordinal 0 with `snapshot_hash` means the stored snapshot text failed its integrity check. Escalate to the owner and check storage provenance. For `state_changed` or `digest_changed`, compare the frozen ref and cutoff, source history, resolver version and formatting. Preserve the frozen snapshot, correct the cause, rerun verification and review the quarantine record. Withdraw a version if it cannot be served reliably.

## 6. Unpublish or retire

In version management, **取消发布** withdraws the current version. Select the reader-visible reason. The API is `POST /api/admin/topics/[id]/unpublish`. The previous live version becomes current if one exists. A named or date replay selecting a withdrawn version returns 410 with metadata only.

Retirement closes the whole topic and permanently reserves its slug. Confirm the slug in the retire dialog. The API is `POST /api/admin/topics/[id]/retire`. Both endpoints accept the same body, for example `{"reason":"privacy","note":null}`. Allowed reasons are `error`, `licence`, `owner_request`, and `privacy`. The optional internal note is limited to 200 characters and rejects UUIDs and 64-character hex hashes. Readers see the category.

## 7. Topic error codes

The status mapping in `src/lib/topics/errors.ts` uses the head before the first colon. Retain the full code when diagnosing a request.

| Code head | HTTP | Operator response |
| --- | --- | --- |
| `topics_disabled` | 404 | Confirm owner enablement. |
| `not_found` | 404 | Check directory access, slug, version or ordinal. |
| `no_version_at_asof` | 404 | Select a date on or after first publication. |
| `topic_retired` | 410 | Read the retirement category. |
| `version_unpublished` | 410 | Read the withdrawal category or choose a live version. |
| `invalid_parameter` | 400 | Correct the named path or query parameter. |
| `slug_taken` | 409 | Choose a new slug, including after retirement. |
| `revision_conflict` | 409 | Reload, reconcile edits and save the current revision. |
| `publish_blocked` | 409 | Resolve the returned blocking codes and repeat disclosure and preview. |
| `resolver_degraded` | 409 | Recover upstream resolution and rerun assembly. |
| `licence_confirmation_missing` | 409 | Inspect missing attribution keys and per-evidence problems in the response metadata. |
| `quota_exceeded` | 429 | Check usage before retrying. |
| `code_version_unavailable` | 503 | Restore deployment version identification. |
| `unsupported_media_type` | 415 | Send JSON with the correct content type. |
| `forbidden_origin` | 403 | Submit from the application origin. |
| `invalid_body` | 400 | Correct the JSON object or field named by the code. |

## 8. What cannot be done from here

There is no operator hard-purge route for published snapshots. Unpublish or retire to remove reader access. Escalate a physical deletion request to the owner for a retention decision (spec Q5). Fixture results cannot establish production rights, approve provider terms, activate a hosted schedule or verify real reader access.
