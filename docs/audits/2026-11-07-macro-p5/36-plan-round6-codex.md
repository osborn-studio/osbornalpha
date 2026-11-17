| # | Severity P1/P2/P3 | Task | Defect | Concrete fix |
|---|---|---|---|---|
| R4 NEW-1 | P1 | D2 | **Closed.** D2 now assigns `strategy/port.ts`, the narrowed merger callback, and `contract.types.test.ts`; latency-branch merge is an explicit prerequisite. | — |
| R5 NEW-1 | P1 | D1a/D2 | **Closed.** Both evidence-store adapter validations and JSON/HTML round-trip tests are assigned; D2 covers failed-parser evidence preservation. | — |
| R5 NEW-2 | P1 | D1a | **Closed.** `db.test.ts` now explicitly covers the renamed RPC and serialized manifest/witness arguments, including omitted values. | — |
| R5 NEW-3 | P2 | C3 | **Closed.** The task explicitly deletes the unused local function without importing its replacement into `strategy-view-model.ts`. | — |
| R5 NEW-4 | P2 | C6/C7 | **Closed.** Preset errors now use `string\|null` with `code: message`; an explicit `.ts` card model and tests cover null-input failures. | — |
| R5 NEW-5 | P2 | D1d | **Closed.** `macro.integration.test.ts` is assigned the seeded retirement test, including two migration executions and exactly one appended event. | — |
| R6 NEW-1 | P1 | D1c/D9 | **Version switches leave mandatory tests failing outside the allowed file lists.** `src/lib/macro/clock-f4.test.ts:21` asserts `['v1']`; its default-version fixtures also use v1. Neither D1c nor D9 assigns this file. D9 additionally switches strategy selectors to v3 without assigning `playbooks.test.ts` and `deviations.test.ts`, whose fixtures and rejection assertions will have been migrated to v2 by D1c. The full test gate cannot pass within the stated edit boundaries. | Assign `src/lib/macro/clock-f4.test.ts` to both tasks. Update default-version fixtures and assertions to v2/v3, retaining explicit accepted-version arrays for historical matcher tests. Add `src/lib/macro/strategy/{playbooks,deviations}.test.ts` to D9; migrate current-version fixtures to v3 and assert rejection of v2. |

not ready