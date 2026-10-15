# Offline migration history comparison

`npm run check:migration-history -- /path/to/history.json expected-project-ref`

This command reads one local file and the locked repository migration inventory. It has no database client, network call, migration execution or history-repair operation. It emits a comparison, never a deploy authorization. The expected project reference must come from the release inventory, not be copied unquestioningly from the input.

The operator supplies a sanitized, complete export of applied version strings in ascending order, captured in an authorized read window. Example format (synthetic; use actual repository versions for a real comparison):

```json
{
  "schema_version": 1,
  "project_ref": "synthetic-project",
  "captured_at": "2026-10-04T10:00:00.000Z",
  "versions": ["20260101000000"]
}
```

Use a canonical UTC timestamp with milliseconds. Exports older than 24 hours or from the future are rejected. Empty exports, unknown fields, non-string versions, duplicate/unordered versions, unknown applied versions and holes in the local ordered prefix fail closed. Empty histories require a separate fresh-install procedure. Only the unapplied suffix is listed; already recorded versions are never proposed for reapplication. The local migration inventory is checked against its existing byte lock first.

A self-declared capture time/project is not authenticated provenance. The output explicitly leaves capture authenticity and production SQL/schema equivalence unverified and sets `authorizesExecution:false`. A prefix match cannot detect a dishonest or incomplete export that omits its tail. Independently verify the export source/completeness and the expected deployment/project; retain its digest with release evidence. Do not use version equality to infer that SQL bytes, database roles or runtime state match. Before execution, the sole release executor must recheck current history and all other release gates.

Do not include SQL statements, article rows, connection strings or credentials. Input is limited to 1 MiB; failures print a generic error, not file contents or paths. Production collection and deployment remain outside this tool. No production database was accessed to implement or test it.

## Evidence hashes and review

`inputSha256` hashes the original input file bytes, suitable for comparison with `sha256sum`. `historySha256` hashes `JSON.stringify({schema_version:1,project_ref,captured_at,versions})` in that key order without whitespace; it is a normalized content digest. `localInventorySha256` hashes the ordered `{file,sha256}` array returned by the locked local inventory. These are integrity checks, not signatures.

Claude CLI Opus 5.5 found no blocking defects in the supplied new code. Its suggestions were addressed with a raw-file digest and stronger CLI no-echo tests. Its third observation concerned an omitted dependency: host inspection and the existing `ci-contract.test.ts` verify that `migrationInventory()` checks locked bytes and has no top-level execution. This dependency was already included in the earlier D1/D2 reviews. Final small follow-up edits were host-tested, not sent for another model review.
