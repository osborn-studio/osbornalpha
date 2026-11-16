Read-only audit. Locations refer to the current plan; uncommitted migration-one changes were excluded.

| ID | CLOSED? | note |
|---|---|---|
| R3-P1-1 | CLOSED | Checks reject unexpected `unit_currency`; SQL and memory publication require exactly the candidate’s declared unit evidence. Promotion preserves the separate role. |
| R3-P2-1 | CLOSED | Holder-only renewal cannot reacquire a released scope. Grants/revokes and adapter signatures match; release follows bounded quiescence. |
| R1-P2-7 | CLOSED | Production PDF/HTML extraction runs in a terminable worker, keeping heartbeats responsive and enforcing a hard deadline. Deployment packaging has a separate regression below. |

| ID | Sev | Task/location | Defect | Concrete fix |
|---|---|---|---|---|
| R4-P2-1 | P2 | Task 10, `worker-entry.mjs` / `F3_EXTRACT_FILES`, lines 8649–8662, 9749–9753 | **The worker’s raw PDF runtime is missing from explicit tracing.** The worker loads source `pdf.ts`, which imports `pdfjs-dist/legacy/build/pdf.mjs` and `pdf.worker.mjs`, but the include list ships only CMaps/fonts from that package. Next 15.5.28 app-route bundling does not supply those raw modules to the separate Node worker; its include processing appends matching files without recursively tracing their imports. Local worker tests retain full `node_modules` and miss this failure. | Include the PDF runtime modules and required package metadata/dependencies explicitly, or build a self-contained worker artifact. Test PDF and HTML extraction from an isolated deployment assembled solely from the route’s `.nft.json`, with no checkout dependencies accessible. |
| R4-P2-2 | P2 | Task 10, `lease.ts::quiesce`, lines 8537–8550; callers in Tasks 10/15/16 | **Drain can exceed the function deadline.** All production callers omit `drainMs`, so a pending renewal adds up to 120 seconds after work finishes. Extraction completing around 220 seconds can therefore wait until 340 seconds before persistence or failure recording, exceeding `maxDuration=300`. The timeout also remains scheduled when renewal wins, unnecessarily keeping local processes alive. | Bound renewal requests and draining by the remaining execution budget, reserving time for final writes/release. Clear the drain timeout whichever branch wins. Add a deadline-edge test with a stalled renewal and assert no timer remains after successful draining. |

The runtime registration sequence itself matches the [tsx ESM API](https://tsx.hirok.io/dev-api/register-esm). The packaging finding follows the installed Next 15 tracing implementation and its [documented bundling behavior](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages). No additional typecheck, lint, signature, or grant defect was established.

An in-memory check of the plan’s heartbeat helper confirmed the 120,000 ms drain timer remains after successful return. Full suites, `next build`, and Vercel execution were not run.

VERDICT: not ready (0 P1, 2 P2)