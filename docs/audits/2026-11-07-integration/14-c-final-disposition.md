# PR C (judgments→company) — final disposition (commander, 2026-11-07)
Rounds: 11 → Codex fix 1 → 13 re-audit. PG17 `src/lib/company/judgments-bridge.integration.test.ts` 2 passed, 1 skipped (owner path).
| ID | Disposition | Evidence |
|---|---|---|
| C-03 | Reject | `num` is `typeof v==='number'&&Number.isFinite(v)` (judgments.ts:19): zero passes. |
| C-04 / C-06 | Reject | F4 `JudgmentCard.display.value`, `condition`, `settlement` are required `…|null` (types.ts:261–264). |
| C-01 | Accepted residual | F4's public list route reads as anon only; no owner-only list path exists, so the scenario is skipped with that reason. |
| C-02 | Partly accepted | `satisfies Record<keyof WireCard…>` makes a new F4 field a compile error; a runtime guard exported by F4 is a follow-up. |
| C-05 / C-07 | Deferred (P2) | Interval vs optional scale and empty-string realized value; fail-closed rendering unaffected. |
Note: vitest.config.ts gains an esbuild TSX transform (test-only) so the rendered-percentage test can import F4's JudgmentCard.
Flag: `NEXT_PUBLIC_COMPANY_JUDGMENTS` stays off — no issuer methodology (owner Q2).
