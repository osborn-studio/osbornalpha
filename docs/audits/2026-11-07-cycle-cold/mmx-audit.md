# Independent mmx review

Discovered with `mmx --help` and `mmx text chat --help`. Ran `mmx text chat --messages-file ... --max-tokens 24000 --output json --non-interactive --no-color`. Model returned `MiniMax-M3.1-Flash`; stop reason `end_turn`. Submitted source diff, the dedicated real-client transport tests, canonical hashing implementation and existing RPC/grant SQL. No production data or credentials were sent. The text below is the actual final audit; thinking content is excluded.

## FINAL AUDIT

**Severity: NONE — no actionable correctness or security findings.**

### Concrete findings
- **Canonicalization and mutation:** `canonicalJson(body)` is captured once and `JSON.parse` creates a detached snapshot. The hash, RPC body, RPC metadata arguments, and returned body therefore agree. Caller mutation during the RPC cannot alter submitted evidence or the persisted JSON value.
- **Stored-body equivalence:** The supplied `macro_put_manifest` inserts the submitted JSONB value or rejects a hash conflict unless the stored body is JSONB-equivalent. For adapter-generated values, the persisted body and returned snapshot are canonically equivalent. JSONB textual representation, notably object-key order, is not guaranteed byte-identical; canonical equivalence is the correct contract.
- **Validation and errors:** Invalid RPC UUIDs, absent or mismatched metadata, incorrect hashes, invalid timestamp shapes, and unexpected row counts fail closed. RPC conflict/domain errors remain distinguishable; transport and metadata-read failures map to `rpc_failed`.
- **Security/grants:** The RPC remains service-role-only, write privileges remain revoked, and admin metadata projection is permitted by the supplied grants. The existing public `SELECT` on the table still exposes the full body, so this change is not a confidentiality control.
- **Evidence limits:** The synthetic benchmark demonstrates response-byte reduction through the real adapter and cycle builder, but not production latency or complete original-adapter speedup. The cited 16.114s cold and 1.167/0.663s warm observations, with only three samples per endpoint, are not p95 and do not isolate this optimization.

### Verdict
**APPROVE** the change as a correctness-preserving response-size optimization. Do not claim a production latency/p95 improvement without representative before/after measurement.

## Disposition

No material findings to fix. The evidence report explicitly limits claims to simulated transport bytes and canonical equivalence. Actual production cold latency remains unmeasured after the change. 201 focused tests, TypeScript and targeted ESLint pass.
