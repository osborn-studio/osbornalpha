# Release verification checklist — MiniMax review

2026-11-07. Source: production agent's MiniMax API review of the sanitized release plan. This is a proposed checklist, not evidence that tests passed. Only final text is retained.

- **Artifact integrity:** Confirm the production macro v2 registry hash exactly matches PR132; retain owner-licence confirmations and evidence that v1 produced no judgments.
- **Exact deployment:** Wait for all required CI checks to pass on `main`; confirm Vercel production reports the same immutable commit SHA.
- **Flag activation:** Redeploy production with the new flags enabled and verify their effective runtime values—do not assume the prior deployment loaded them.
- **Authenticated smoke test:** Validate `/macro` and every child page while signed in, including data, loading, empty, and error states.
- **Compatibility and disclosure:** Verify legacy redirects resolve correctly; ensure public methodology and published hash match the shipped artifact; confirm no unsupported or invented probability is displayed.
- **Rollback:** If any check fails, disable the new flags and redeploy the last known-good exact SHA with its matching registry/artifact, then repeat authenticated, redirect, and public-hash checks.
