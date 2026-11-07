# Independent company release audit — PR 145

Verdict: **PASS within the reviewed scope; no demonstrated new PR 145 regression.** This is not production release approval.

Audited 2026-11-07. Head: `956276d93201eb7864836a2040dab3cb174159e9`; comparison base: `dc47ba2eb0768971f7362750bf504a90ceb68026`. [PR 145](https://github.com/osborn-studio/osbornalpha/pull/145). Production source was not edited. Scope excludes PR 142, industry and evals. No deployment, migration, production query, shared root configuration or flag change was made.

## Evidence and tests

Eight new tests live exclusively in `tests/company-release-audit`, with their own config because the repository default collects only `src/**/*.test.ts`.

```sh
PATH=/opt/homebrew/opt/node@22/bin:$PATH node_modules/.bin/vitest run tests/company-release-audit --config tests/company-release-audit/vitest.config.ts --maxWorkers=1
```

- **8 passed / 2 files** on Node 22.22.1, Vitest 4.1.11; targeted ESLint and `git diff --check` passed.
- Four HTTP-route cases cross US/CN with public/admin. Each first publishes a valid control fact and event; changing only the evidence run to another run or whitespace withholds both values, removes the evidence DTO, and leaves no financial value in serialized JSON. Admin responses remain private/no-store. Public CN controls include a valid bound PDF locator, so citation withholding cannot mask a run failure.
- Two real-gate cases prove that admin cannot use a filing owned by another member of the same lineage. Valid predecessor ownership succeeds first.
- Two rendered component cases verify that an unset or disabled judgments flag supplies no fetch URL, including replay mode. This checks the existing default, without changing deployment flags.
- The six route/ownership tests were copied into a scratch archive of the comparison base. **Four failed / two passed**: all four market/access run-binding cases leaked the control value before PR 145. The same tests pass at the audited head. This is regression sensitivity for the fix already in PR 145, not a new production defect.

## Five independent GPT-6.1-sol CLI sessions

All five used explicit `-m gpt-6.1-sol`, independent initial prompts, and no source edits. Initial reviews ran read-only. Their first test attempts hit runner `__dirname` and sandbox temporary-directory restrictions; these attempts executed zero tests and are not counted as verification. The same sessions then ran bounded commands with an equivalent scratch ESM config, scratch TMPDIR, permitted test-temporary writes, `--no-cache`, and `--maxWorkers=1`. Every final session exited 0.

| Session | Thread ID | Successful targeted execution | Final assessment |
| --- | --- | --- | --- |
| Issuer/schema | `01a1b68b-18ba-7011-8284-cb087c5d4500` | 37 passed, 2 files | No PR regression; malformed-reference limit below |
| Evidence/run | `01a1b68b-18ce-7e33-a56c-02d91b4f2a00` | 25 passed, 2 files | No provenance bypass demonstrated |
| Admin scope | `01a1b68b-18ba-70a2-8f8b-f9209f2bee63` | 22 passed, 3 files | No public/admin or CN exception regression |
| Lineage | `01a1b68b-18c5-7233-a86b-7d94ecd52790` | 27 passed, 2 files | No reachable wrong-issuer exposure demonstrated |
| Independent regression | `01a1b68b-18c5-72b3-8df1-a786283040c6` | 2 passed, 3 skipped; 1 file passed, 1 skipped | Real F4 handler/memory DB passed; PostgreSQL bridge unverified |

Counts overlap; do not sum them as unique tests. Source snapshots, raw JSONL, exit files, final session reports and test logs are retained under `/tmp/osstack/osbornalpha-independent-sessions/company-release-audit/`.

## Findings and dispositions

1. **Run provenance passes.** `src/lib/company/evidence-gate.ts:42` requires nonblank evidence run ID equal to the fact's run before the admin exception at line 48. New HTTP tests establish fact/event withholding and DTO omission.
2. **Requested issuer binding passes.** `src/lib/company/judgments.ts:93` rejects an envelope for another issuer, including empty cards; `src/components/company/JudgmentsView.tsx:18` passes its issuer. Existing contract/component tests cover wrong issuer, incompatible schema, replay echo and post-cutoff cases.
3. **Lineage and admin scope pass the tested controls.** `src/lib/company/route.ts:110` compares each fact's filing ownership; membership in the same lineage alone does not qualify a filing. `judgments.ts:97` accepts predecessor cards whose original subject equals `merged_from`; membership is established by the F4 server. Forging a self-consistent predecessor label alone does not demonstrate exposure through that server.
4. **Pre-existing malformed-response limit, not a demonstrated production issue:** `judgments.ts:77` accepts any object for an input ref. A forged `financial_fact` ref `{fact_id:{toString:null}}` is accepted on both base and head, then `src/components/judgments/view-model.ts:109` throws `TypeError: Cannot convert object to primitive value`; the drawer calls `inputRows` at `InputsDrawer.tsx:51`. The valid control succeeds. The CLI probe reproduced this on both revisions (`malformed-ref-probe.log`). No production path emitting this forged value was established; no unrelated source patch or expected-failure test was added.

## Independent mmx audits

- **Evidence gate:** MiniMax-M3.1-Flash, `stop_reason=end_turn`, final text **PASS**. Confirmed run binding before the CN admin waiver, US requirements unwaived, and exact evidence index handling.
- **Judgments diff:** MiniMax-M2.7, `stop_reason=end_turn`, adjudicated final text **PASS**. Initially claimed TS2345 from nullable issuer; rejected with a strict TypeScript compiler probe using the exact aliased `const enabled` guard, exit 0 with no diagnostics. The model retracted the finding and confirmed envelope equality preserves predecessor-card semantics. Actual project diagnostics contained no TS2345.
- Three earlier broader M3.1 attempts ended at `max_tokens` with thinking only; they are retained but **not counted as completed audits**. Raw requests, responses and final text are in the scratch evidence directory.

## Limits and execution notes

- No native browser, live provider/auth/database checks, production data validation, human acceptance, deployment or build was performed. PostgreSQL bridge tests were skipped.
- Production CN public values still require a real PDF reconciliation source; `productionReadDeps().pdf` remains empty. Production issuer methodologies remain absent. These are existing readiness blockers, not repaired or claimed satisfied by these tests.
- Judgments defaults off. F3 drawer defaults on when unset; that pre-existing behavior was neither changed nor conflated with the judgments flag. No environment files or production flag settings were altered.
- Project `tsc --noEmit --incremental false` was attempted: it reports four diagnostics from the shared dependency tree's missing `pdfjs-dist/legacy/build/pdf.mjs` (and the resulting implicit-any in `scripts/documents/smoke-pdf.ts`). It is **not a passing project typecheck**. The isolated strict nullability probe passed. Shared dependencies were not modified.
- The initial audit config used `mergeConfig`, which concatenated include arrays and briefly started unrelated document tests. That run was terminated after missing-pdfjs failures; it provides no full-suite verdict. The committed config replaces the include list, and subsequent commands explicitly target the dedicated audit directory.
