Read-only static audit; no tests or builds executed. Locations below refer to the plan.

| ID | CLOSED? | note |
|---|---|---|
| R4-P2-1 | CLOSED | Worker bundle includes the PDF runtime; tracing includes the bundle and assets. Isolated-worker tests exercise PDF/HTML extraction. |
| R4-P2-2 | CLOSED | Renewal/drain waits use remaining budget minus reserve; wait timers are cleared. All three production callers supply the budget. |
| recheck-N1 | CLOSED | Task 7 explicitly passes `reset=true` for coverage-gap restarts, matching committed Task 1–2 SQL, interface, and adapters. |

| ID | Sev | Task/location | Defect | Concrete fix |
|---|---|---|---|---|
| R5-P2-1 | P2 | Task 10: lines 8679, 8780, 9740; Task 19: runbook §2 | **Local extraction lacks bundle preparation.** Only `prebuild` creates the gitignored default worker. After a fresh install, the documented direct `extract.ts --apply` command—and extraction through `npm run dev`—starts a nonexistent worker. This records `extract_error` after claiming the document, consuming attempts and eventually marking valid documents `extract_failed`. The temporary-bundle test does not cover these entry points. | Add worker preparation to the supported local CLI/dev workflows and document it in the runbook. Check bundle availability before claiming documents so missing build artifacts fail as setup errors. Verify the documented extraction command from a clean checkout. |

`npm test`, typecheck, and CI `test:db` do **not** require the default bundle first: worker tests build an explicit temporary entry, other extraction tests inject implementations, and typechecking does not execute workers. No additional P1/P2 signature or budget regression established.

VERDICT: not ready (0 P1, 1 P2)