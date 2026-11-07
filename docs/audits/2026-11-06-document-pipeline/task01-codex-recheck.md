Read-only static review; database tests were not run.

| ID | CLOSED? | note |
|---|---|---|
| Review P2-1 | CLOSED | Missing/null concepts and approvals containing NULL now fail eligibility. |
| Review P2-2 | CLOSED | Malformed array elements now produce NULL citation IDs and are rejected. |
| Challenge F1 | CLOSED | NULL membership bypass eliminated; regression cases added. |
| Challenge F2 | NOT CLOSED | Malformed elements are rejected, but permitted roles remain unchecked: `period:[{citation_id:validId,role:"bogus"}]` still passes. |
| Challenge F3 | CLOSED | Clear-then-regress is blocked; explicit reset and completion remain allowed. See regression N1. |
| Challenge F4 | CLOSED | `coalesce(...,false)` rejects unknown decision kinds while preserving valid candidate, human and auto shapes. |
| Challenge F5 | NOT CLOSED | Tests cover holder success, attempt preservation, wrong batch and terminal states; expired-but-unclaimed renewal and actual takeover remain untested. |
| Opus: NULL concept | CLOSED | Explicit NULL and membership guards added. |
| Opus: SHARE locks | CLOSED | Approval reads and inheritance-source selection now acquire SHARE locks. |
| Opus: duplicate issuers | CLOSED | Duplicate issuer strings are explicitly rejected before reconciliation. |
| Opus: document locks | CLOSED | Identified document locks now use `FOR NO KEY UPDATE`. |

| ID | Sev | file:line | defect | fix |
|---|---|---|---|---|
| N1 | P2 | `supabase/migrations/20261108090000_disclosure_documents.sql:595` | New guard rejects the planned EDGAR coverage-gap completion path. `syncIssuer` calls `advanceCursor(...,'backfill',null,false)` after finishing available segments when history coverage is incomplete (plan lines 7111–7119). This now raises `cursor_regression`, preventing the intended successful daily restart. The caller is planned code, not yet implemented here. | Preserve the guard; update the coverage-gap caller to explicitly reset, or persist a fresh restart cursor with increasing `seq`. Add a contract test for this path. |

No confirmed regression for valid non-financial `{value:id}` citations, normal completion, renewal behavior, or valid decision shapes. F2 retains an incomplete P2 fix; F5 remains a P3 coverage gap.

VERDICT: fail (0 P1, 2 P2)