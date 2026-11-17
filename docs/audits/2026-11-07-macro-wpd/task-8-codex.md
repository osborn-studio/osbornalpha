Task 8 is implemented and left uncommitted.

Added `usd_mn` and `usd_bn` quality profiles and tests for their ranges and jump behavior. Added three `month_end` regression tests covering weekly Wednesday observations and LPR quote dates. The initial test run failed on the missing `usd_mn` unit; the derive tests passed against the existing `derive.ts`.

**Diff:** 3 files, 37 insertions, 1 deletion. `derive.ts` and the closure file were untouched. `git diff --check` passed, and the tracked diff against `origin/main` contains no closure or dependency files.

**Gates:** focused suite 22/22 passed; typecheck and lint passed; broader macro and cron suite 894 passed, 77 skipped.