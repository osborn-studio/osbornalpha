Read-only review; no tests executed. Locations below refer to the current plan.

| R1 ID | CLOSED? | note |
|---|---|---|
| P1-2 | NOT CLOSED | Exact value and sign replay fixes the original `1 × 1000 → 999` case, but EPS currency verification trusts `payload.unit` itself. See R2-P1-1. |
| P1-3 | CLOSED | Tax credits now use negative absolute value; already-negative and zero values do not record a false sign flip. |
| P1-4 | CLOSED | The sixth argument reaches the adapters and publisher. Document/extraction locks protect revalidation of current extraction, primary role and completed processing before publication. |
| P2-1 | CLOSED | Look-ahead pages cap at 999; approval limits above 999 fail before querying. All three adapters agree. |
| P2-2 | CLOSED | Replay assertions now use disposable databases; they no longer replace policies or constraints in the shared test database. |
| P2-3 | CLOSED | All seven trigger helpers have explicit revocations; function-inventory tests include them and the new renewal functions. |
| P2-4 | CLOSED | Sync rereads scope after claiming. SQL rejects completed-backfill regression and non-increasing cursor sequences unless explicitly reset. |
| P2-5 | CLOSED | Source-reference checkpoints and reference-keyed attempts address the reported insertion/removal and retry-transfer cases. |
| P2-6 | CLOSED | Published-run links whose facts remain quarantined no longer occupy the recovery queue; resolved or deleted facts become actionable again. |
| P2-7 | NOT CLOSED | Renewal occurs **between** phases, not during long operations. For example, extraction renews only after `layoutOf` returns (Task 10, lines 9127–9134). An extraction exceeding 600 seconds can still be taken over repeatedly and exhaust its attempts. Candidate generation/checking and promotion loops likewise lack periodic renewal or enforced operation bounds. Add renewal during asynchronous work and bounds/worker isolation for blocking work; test repeated takeover across actual long phases. |

P1-1’s rejection rationale is consistent with the plan; it is not reopened.

| ID | Sev | Task/location | Defect | Concrete fix |
|---|---|---|---|---|
| R2-P1-1 | P1 | Task 15, `checks.ts::unitEvidence`, lines 14510–14515; Task 14, EPS evidence generation, lines 13876–13880 | **EPS currency replay is circular.** For a citation containing only `仙` or `cents`, the checker derives `tableCurrency` from the candidate’s own `payload.unit`. A CNY statement’s candidate changed to `USD/share` therefore still passes unit/value replay: `detectEpsUnit` returns the supplied USD fallback. The generator records only the subunit token, so the published evidence cannot independently establish the inherited currency. This is the remaining evidence-validation gap in P1-2. | Preserve a separate citation for the table currency whenever the EPS token is currency-neutral. Derive the fallback from verified evidence, never the payload. Test a CNY table with `cents` and a deliberately changed `USD/share` payload; require blocking failure. |
| R2-P2-1 | P2 | Tasks 14–15, `scale.ts::detectAmountUnit`, lines 13611–13624; `generate.ts`; `checks.ts::unitEvidence`, lines 14517–14518 | **The new replay check rejects valid candidates produced by the generator.** Amount detection combines currency and multiplier across multiple header lines, but returns only the multiplier line as its citation. With `人民幣` on one line and `千元` on another, generation produces CNY × 1000; replay examines only `千元` and fails with `no_currency`. This newly blocks supported disclosures and reduces recall. | Preserve both currency and multiplier evidence, or cite a verified range containing both. Replay the same evidence set used by generation. Add a generation-through-checks test with split currency/multiplier lines. |

Counts include outstanding R1-P2-7; P1-2/R2-P1-1 count once.

VERDICT: not ready (1 P1, 2 P2)