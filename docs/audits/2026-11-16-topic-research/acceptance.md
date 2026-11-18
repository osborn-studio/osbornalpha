# Topic research acceptance · PR-8

Scope is the T0 column of design §9. Acceptance IDs come from §13.3, exit criteria from §1.1 and phase assignments from §14. Results apply only to the named evidence. Where a row has partial coverage, the uncovered assertion is identified explicitly. Parameterized names use the literal title template in the test file.

Run commands from the repository root. **PW** denotes `TOPICS_E2E_FIXTURES=1 npx playwright test e2e/topics.spec.ts e2e/topics-admin.spec.ts --workers=1 --reporter=list`. For local PG17, prefix the database and migration commands with `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH`.

## Acceptance and exit criteria

| ID | Requirement | Test file and exact test title | Command | Result |
| --- | --- | --- | --- | --- |
| A1 | Environment gate and absent Copilot tool | `src/app/api/topics/routes.test.ts` — A1: every route is 404 topics_disabled while TOPICS_ENABLED is unset<br>`src/app/(app)/intel/topics/pages.test.ts` — gates the directory before data reads<br>no test — no tool-registration assertion | `npx vitest run src/app/api/topics/routes.test.ts`<br>`npx vitest run 'src/app/(app)/intel/topics/pages.test.ts'` | Named Vitest tests passed |
| A2 | Closed directory and admin preview | `src/app/api/topics/routes.test.ts` — returns 404 on every route while the directory is closed<br>`src/lib/topics/public-route.test.ts` — projects preview base reads with the switch off and preserves per-row drift time<br>no test — closed-directory preview banner text | `npx vitest run src/app/api/topics/routes.test.ts`<br>`npx vitest run src/lib/topics/public-route.test.ts` | Named Vitest tests passed |
| A3 | Every draft ref survives to the response with a state | `src/lib/topics/snapshot.test.ts` — copies every ref and content block into a canonical public snapshot<br>`src/lib/topics/public-read.test.ts` — A3: returns every evidence item of the snapshot with a state | `npx vitest run src/lib/topics/snapshot.test.ts`<br>`npx vitest run src/lib/topics/public-read.test.ts` | Named Vitest tests passed |
| A4 | Same-period revision, frozen v1 and both drawer values | `src/lib/topics/scenario.test.ts` — v1 stays byte-identical after a revision is injected; asOf before v1 is 404; the CN value never leaves<br>`src/lib/topics/scenario.test.ts` — A4 and A15 retain frozen evidence and the last successful drift check | `npx vitest run src/lib/topics/scenario.test.ts` | Named Vitest tests passed |
| A5 | Replay boundaries, withdrawal and current-version fallback | `src/lib/topics/public-read.test.ts` — A5: replay preserves withdrawal and selection history<br>`src/lib/topics/asof.test.ts` — validates calendar dates and exact staleness boundaries<br>`src/lib/topics/publish.test.ts` — publishes edited drafts as linked versions and restores the previous current version | `npx vitest run src/lib/topics/public-read.test.ts`<br>`npx vitest run src/lib/topics/asof.test.ts`<br>`npx vitest run src/lib/topics/publish.test.ts` | Named Vitest tests passed |
| A5b | Restricted/retracted values, summary and drawer masked across views, snapshot hash preserved | `src/lib/topics/masking.test.ts` — %s removes the value, the drawer payload and the summary sentences in every view<br>`src/lib/topics/masking.test.ts` — never changes the snapshot it was given<br>`src/lib/topics/public-read.test.ts` — applies stored drift to the directory, dossier, replay and drawer<br>no test — citation snippet in all four serialized HTTP responses | `npx vitest run src/lib/topics/masking.test.ts`<br>`npx vitest run src/lib/topics/public-read.test.ts` | Named Vitest tests passed |
| A6 | CN fact withheld without the value anywhere in public JSON | `src/lib/evidence/resolvers/fact.test.ts` — A6: the CN value appears nowhere in the serialised public result<br>`src/lib/topics/scenario.test.ts` — v1 stays byte-identical after a revision is injected; asOf before v1 is 404; the CN value never leaves | `npx vitest run src/lib/evidence/resolvers/fact.test.ts`<br>`npx vitest run src/lib/topics/scenario.test.ts` | Named Vitest tests passed |
| A7 | Replay matches and changed formatting quarantines the affected ordinal | `src/lib/topics/scenario.test.ts` — A7 audits matching and changed replays and quarantines just the changed ordinal | `npx vitest run src/lib/topics/scenario.test.ts` | Named Vitest tests passed |
| A8 | HK unserved, broker unsupported and publication blocked | `src/lib/evidence/contract.test.ts` — produces exactly the states of the spec table<br>`src/lib/evidence/contract.test.ts` — A8: a broker ref is unsupported<br>`src/lib/topics/disclosure.test.ts` — A8: an unsupported broker ref blocks with kind_unsupported<br>no test — HTTP 409 for this specific broker case | `npx vitest run src/lib/evidence/contract.test.ts`<br>`npx vitest run src/lib/topics/disclosure.test.ts` | Named Vitest tests passed |
| A9 | Approved summary references and deterministic rejection codes | no test — T1 topic generation and approval | — | Deferred |
| A10 | Existing macro suites green after the T1 refactor | no test — post-refactor regression result on T0 | `npx vitest run src/lib/macro/strategy/{explain-validate,explain-render,explain-request}.test.ts`<br>`npm run test:db` (strategy.integration.test.ts) | Deferred |
| A11 | Promotion strips private fields and blocks an unreviewed block | no test — T2 promotion flow | — | Deferred |
| A12 | Promotion preserves research row counts and update times | no test — T2 before/after database measurement | — | Deferred |
| A13 | Owner document ID blocks disclosure | `src/lib/topics/disclosure.test.ts` — A13: an owner source-document id in the text blocks with private_reference<br>no test — production owner ID loading (T2) | `npx vitest run src/lib/topics/disclosure.test.ts` | Named Vitest tests passed |
| A14 | Immutable versions and evidence, one-time withdrawal | `src/lib/topics/topics.integration.test.ts` — versions are immutable except the one-time unpublish columns (A14) | `npm run test:db` | Passed in the PG17 run recorded below |
| A15 | Failed check preserves timestamp and shows stale warning after 72 hours | `src/lib/topics/scenario.test.ts` — A4 and A15 retain frozen evidence and the last successful drift check<br>`src/components/topics/dossier/version-bar-model.test.ts` — shows drift warning only when unchecked and localizes the bar | `npx vitest run src/lib/topics/scenario.test.ts`<br>`npx vitest run src/components/topics/dossier/version-bar-model.test.ts` | Named Vitest tests passed |
| A16 | Revoking an excerpt licence masks text and preserves the hash | no test — T2 licensed excerpt revocation | — | Deferred |
| A17 | Chart table equivalent and topic locale parity | `src/components/topics/dossier/series-model.test.ts` — keeps other section evidence in the table equivalent<br>`src/lib/topics/messages-parity.test.ts` — has identical keys, placeholders and no empty strings<br>`e2e/topics.spec.ts` — series table switch reveals its equivalent table | `npx vitest run src/components/topics/dossier/series-model.test.ts`<br>`npx vitest run src/lib/topics/messages-parity.test.ts`<br>PW | Named Vitest tests passed · browser blocked |
| A18 | Creating a retired slug returns 409 slug_taken | `src/app/api/admin/topics/admin-routes.test.ts` — validates publication and withdrawal requests before mutation, and reserves retired slugs | `npx vitest run src/app/api/admin/topics/admin-routes.test.ts` | Named Vitest tests passed |
| Exit 1 | Publish macro, US fact and public F3 citation, inject a revision, read frozen v1 and reject pre-v1 replay | `src/lib/topics/scenario.test.ts` — v1 stays byte-identical after a revision is injected; asOf before v1 is 404; the CN value never leaves<br>`src/lib/topics/scenario.test.ts` — A4 and A15 retain frozen evidence and the last successful drift check<br>`src/app/api/topics/routes.test.ts` — GET /api/topics/[slug]?asOf before the first version → 404 no_version_at_asof | `npx vitest run src/lib/topics/scenario.test.ts`<br>`npx vitest run src/app/api/topics/routes.test.ts` | Named Vitest tests passed |
| Exit 2 | CN value absent from the serialized public projection | `src/lib/topics/scenario.test.ts` — v1 stays byte-identical after a revision is injected; asOf before v1 is 404; the CN value never leaves<br>`src/lib/evidence/resolvers/fact.test.ts` — A6: the CN value appears nowhere in the serialised public result | `npx vitest run src/lib/topics/scenario.test.ts`<br>`npx vitest run src/lib/evidence/resolvers/fact.test.ts` | Named Vitest tests passed |
| Exit 3 | Private thesis promotion strips identifiers without source writes | no test — T2 promotion | — | Deferred |
| Exit 4 | Topic validator rejects numerals, advice and multiple sentences | no test — T1 topic validator | — | Deferred |
| Exit 5 | Full unit, PG17, migration and locale gates | `src/lib/topics/messages-parity.test.ts` — has identical keys, placeholders and no empty strings | `npx vitest run src/lib/topics/messages-parity.test.ts`<br>`npm test`<br>`npm run test:db`<br>`npm run test:migrations` | Locale parity passed · gate results recorded below (one unrelated PG failure) |

## Capability matrix · spec §9 T0

Evidence samples below are named exports in `src/lib/evidence/fixtures/`. Their expected states are asserted by `src/lib/evidence/contract.test.ts` in “produces exactly the states of the spec table”. Published dossier fixtures live in `src/lib/topics/fixtures/published.ts`.

| Capability | T0 | Fixture or test evidence |
| --- | --- | --- |
| Directory, dossier, versions, date replay | Served with switches open | Published fixture, `rates-and-banks` v1 and v2. See A1, A2 and A5 for gates and withdrawal. |
| US macro observation | Served | `macro.ts`, `OBS.unrateV1` (US_UNRATE). |
| CN macro observation | Served for eligible catalog series, otherwise withheld | No CN-specific topic fixture. `OBS.vix` and `OBS.thirdParty` exercise catalog restriction and unconfirmed rights with US series. The resolver uses catalog status and rights. |
| US financial fact | Served after evidence gate | `facts.ts`, `FACT.usOk` and `FACT.usIncomplete`. |
| CN financial fact | Withheld | `FACT.cnPending`, A6. |
| HK fact | Not served | `FACT.hk`, reason `hk_not_served`. |
| Industry metric | Resolver built, missing when no published data | `industry.ts`, `CELL.sicOk`, `CELL.swInternal`, `CELL.noRow`. Published fixture includes an expected slot with reason `industry_not_published`. Production availability unverified. |
| Public document citation | Served | `documents.ts`, `DOC.ok`. Contract test “places a public citation snippet only in the drawer locator”. |
| Private or licensed document citation | Withheld | `DOC.private` and `DOC.internal`; A13 covers injected private IDs in owner text. |
| Broker report metadata | Unsupported, blocks disclosure | `SAMPLES.broker_report_meta` in `index.ts`; A8. |
| Judgment | Served for publishable methodology | `judgments.ts`, `JUDGMENT.ok` and `JUDGMENT.private`. |
| LLM summary | Generation and approval not built | Published fixture v2 carries a synthetic summary for rendering. No generation or approval test (T1). |
| Private thesis promotion | Not built | No test (T2). |
| Owner note | Served | Published fixture entry `note`; public-read.test.ts, “uses real, deterministic fixture publications with realistic evidence”. |
| Licensed excerpt | Not built | `src/lib/topics/drafts.test.ts` submits `entry_type:'licensed_excerpt'` as an invalid entry. |
| Drift checks and replay verification | Served | A4, A7 and A15 use the mutable evidence seed in `src/lib/topics/fixtures/scenario.ts`. |
| Copilot topic_dossier | Not built | No registration test (T4). The current tool registry is `src/lib/agent/tools.ts`. |

## Not verified locally

- Production industry runs, row counts, and CN macro licence coverage. Catalog gating in fixtures cannot establish production rights or settle the owner’s FRED terms decision.
- Hosted Supabase privileges for non-superuser postgres, authenticated JWT roles, and PostgREST exposure of views and RPCs.
- Vercel cron delivery, runtime limits and hosted cache revalidation of the chain link.
- Live model calls, provider terms, latency and refusals. T0 fixtures supply rendered summary data.
- Signed-in end-to-end flows against a real database. Public and admin fixture stores also have incompatible seeds and switches. The public store opens deterministic publications using a fixed clock. The admin store starts closed with editable drafts of the same slugs. Publication through admin followed by a public directory read is unverified.
- Real-phone visual fidelity: the phone checks use a 390 px desktop browser viewport.
- Later-phase acceptance gaps (T1, T2, T4) are identified in the rows above.

## Gate results on the PR-8 branch

Observed on branch `claude/topics-pr8-e2e-runbook` (stacked on PR-7), macOS, PostgreSQL 17, 2026-11-18.

| Gate | Command | Observed |
| --- | --- | --- |
| Types | `npm run typecheck` | pass |
| Lint | `npm run lint` | pass |
| Unit | `npm test` | 952 files passed, 57 skipped; 10621 tests passed, 949 skipped; exit 0 |
| Build | `npm run build` | pass |
| PG17 | `npm run test:db` | 1008 of 1009 files passed; 11560 tests passed, 1 failed, 9 skipped. The failure is `src/lib/company/company-research.integration.test.ts`, "backlog details count active streams, order failures and limit the named list to 20" (expected 250 to be 249), a known load-dependent failure outside this module. `src/lib/topics/topics.integration.test.ts` passed, which covers A14 |
| Migrations | `npm run test:migrations` | PASS |
| Playwright, fixture mode | **PW** | 20 passed |
| Playwright, variable unset | same command without `TOPICS_E2E_FIXTURES=1` | 20 skipped |

