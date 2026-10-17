# Shared TWSE quote request ownership — local candidate, 2026-10-06

## Contract and implementation

One process shares in-flight TWSE quote work only when the sorted exact cache-miss ticker set matches. Cache hits and invalid input do not enter the key. A single owner has the existing4s fetch/body deadline; late subscribers inherit the remaining deadline. Each subscriber owns only its wait. Cancelling one parent removes that listener and does not cancel another live subscriber. When the last subscriber leaves, remove the entry before aborting upstream; a later caller starts fresh. Identity-checked cleanup cannot delete a replacement entry. Publish a real pending promise before synchronous operation dispatch so a re-entrant subscriber never receives undefined.

Public batch results retain their own cache hits and copy shared values into a separate map. Existing timeout-to-null, missing-ticker null and late fetch/body cache refusal remain. Generation ordering protects overlapping but different miss sets. Malformed msgArray members (null, arrays, primitives) are skipped, preserving valid quotes and missing nulls for all subscribers. No timestamps or investment judgments are synthesized.

## Evidence and audit disposition

Initial osstack task_82faca9d passed. Strict Claude CLI claude-opus-5-5 task_da28f8dd reviewed immutable source/synthetic input with no tools/MCP. Accepted all3 findings:

1. Sorted-key/miss-only test gap: reordered tickers with different cached-hit composition share; different overlapping miss sets do not share.
2. Malformed null provider member could throw to every subscriber: skip non-object/array members and test valid/missing outputs for both joiners.
3. Synchronous operation re-entry could observe an undefined promise: initialize a deferred shared promise before dispatch; test nested join gets owner value and alternate operation is never called. This preserves synchronous dispatch and existing cancellation tests. Self-await by an operation on its own key is unsupported; the owner deadline still bounds the wait.

Added explicit listener-removal cancellation control. Final task_c7537558 passed ten focused provider/quote utility/quote batch route suites, typecheck/lint/diff with0 verifier issues. Eight helper tests plus12 provider cancellation tests and7 cache tests. Every fetch is synthetic; no real provider/DB/alert calls. Final fixes host verified, not second-reviewed. Evidence: /Users/osborn/.osborn/verification/knowledge-cycle-alpha-i1/opus-shared-quotes-20261006-1924/disposition.md.

## Remaining gates

No cross-process/instance or overlapping-batch dedup, distributed rate limiting, case alias normalization, cache capacity/reclamation or market timestamp validation. Batches with a different miss set deliberately use separate owners; source retention generation guards remain. A late subscriber may immediately encounter an almost-expired owner deadline and receive null. The shared key must identify the same operation and parameters; helper is scoped to trusted quote orchestration, not arbitrary user-controlled operations. No retries or schedule changes.

Production still requires isolated Next fetch/cache semantics and ordinary-pattern cold/concurrent/cross-instance request-rate verification. No deployment, push or Actions in this batch. D3.2 remains partial; Tushare cache/Retry-After, alert recovery/outbox, ordinary24h evidence and production/login/human-label gates remain open.
