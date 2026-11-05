1. **N3 — RESOLVED.** Task 11, Step 2 now provisions every `FIXTURE_ISSUERS` entry in FK order: `stocks_universe` → `issuers` → `issuer_securities`, then creates its scope and includes it in replay.

2. **New draft-4 defects: none found.** Task 11, Step 2 derives provisioning and cleanup from the same list; cleanup sets each fixture issuer’s scope priority to zero through the existing upsert contract. Read-only static review; runtime gates were not executed.

3. **Verdict: ready for execution by implementer agents—no blocking defects remain within this review’s scope.**