# Offline company evidence replay

The company facts-series endpoint supplies a disclosure entry, its filing and an evidence dictionary. This command checks a selected entry against the exact EDGAR snapshot bytes downloaded through the entry's `evidence[factId].snapshot.download` link. Run locally on Node 22; it needs no credentials, database or network access and writes no files.

1. Save the unmodified JSON response from `GET /api/companies/<ticker>/facts?concept=...&periodStart=...&periodEnd=...&unit=...&asOf=...` as `facts-response.json`. `asOf` is optional. Select a `kind: "fact"` entry's `factId` from `series` or `otherUnitSeries`.
2. Download that entry's snapshot through its stable download link and save the original bytes as `snapshot.json`. Do not reformat the file: even whitespace changes its SHA-256. The download endpoint mints a fresh signed URL on each request.
3. Run:

```sh
node --import tsx scripts/company/replay-evidence.ts facts-response.json <fact-id> snapshot.json
```

Exit codes: `0` means `status: "source_replay_verified"`; `1` means a bounded rejection reason; `2` means invalid arguments or unreadable/invalid input JSON. CLI read errors omit paths and file contents.

The verifier recomputes the byte SHA, reparses with the landed EDGAR parser and current mapping, requires exactly one full-key/value candidate, checks its raw hash and parser locator against the response, derives the JSON pointer and resolves it back to the exact canonical decimal value. It includes published ambiguous/odd-duration candidates under the same semantics as the evidence index. It does not fetch missing evidence, repair metadata or fall back to another record. The selected run ID, filing ID and mapping version must agree with the evidence DTO. Withheld entries, truncated responses, unsupported mappings and CN snapshots are rejected.

`source_replay_verified` establishes consistency of the supplied source bytes and selected value under the **current** parser/mapping. It does not authenticate the saved response, code/tool metadata or issuer identity; certify historical parser behavior or completeness of disclosure history; prove that a response was actually available on its claimed `asOf`; or establish human-verified financial truth. JSON decoding and numeric normalization follow the landed parser's semantics. Keep the original response and snapshot alongside the command output for review. Fixture-derived demonstrations are parser checks, not the pending human gold acceptance matrix.

CN per-value PDF reconciliation remains an upstream prerequisite: production still uses `emptyPdfLocatorSource`. This command neither creates PDF locators nor redistributes Tushare snapshots. Issuer judgment methods and their default-off flag are unaffected.
