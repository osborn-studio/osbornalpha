Implemented and documented in [the handoff report](docs/audits/2026-11-07-macro-wpd/pr3b-2-report.md).

- Resolved cron contents, moved method/test to v3, updated selectors, retirement flow, fixtures and runbooks.
- Gate: **3,393 passed, 195 skipped, 0 failed**. Typecheck and lint pass.
- Replay check passes via `node --import tsx`; exact `npx tsx` is blocked by sandbox IPC restrictions.
- Protected tests: 237 passed; four stock-page tests fail on local listener `EPERM`. PostgreSQL verification is similarly blocked.
- No staging, commits or deployment. Commander must stage the resolved conflict.

V3 formula hash:
`f5d2d6cb32e21cd024e8189a806507371b8e25dfdc1399007476fb44cc83732c`