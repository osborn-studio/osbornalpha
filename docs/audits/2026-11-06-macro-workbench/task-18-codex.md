| id | P1/P2/P3 | file:line | defect | concrete fix |
|---|---|---|---|---|
| T18-1 | P2 | docs/runbooks/macro-sync.md:318 | Rollback instructs rejecting already-published `ok` observations. The lifecycle trigger forbids this; CLI rejection only affects quarantined members. Next publication can restore the bad data. | Stop publishers before rollback; document a supported correction procedure before resuming. |
| T18-2 | P2 | docs/runbooks/macro-sync.md:177 | Migration history is recorded unconditionally after execution. `curl -sS` and `jq .` can succeed on an HTTP error response, marking an unapplied migration as applied. | Fail on HTTP/SQL errors; record history only after verified success, preferably atomically with migration execution. |
| T18-3 | P2 | docs/audits/2026-11-06-macro-workbench/20-implementation-log.md:51 | Required HTTP preview, browser evidence, and measured overview p95 remain unperformed. Unit tests do not complete Task 18’s acceptance contract. | Run and record Steps 7–8; retain explicit blockers where unavailable, including permitted guest-mode evidence. |
| T18-4 | P3 | docs/runbooks/macro-sync.md:223 | Deployment creates a sibling worktree, violating the mandatory workspace placement rule. | Use `~/Developer/CodeX/.worktrees/OsbornAlpha/deploy`; remove it and run `git worktree prune` afterward. |

Verdict: fix P1/P2