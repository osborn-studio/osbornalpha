# Topic Research (专题研究, `/intel/topics`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the fifth research section: a directory of published topics where each topic is a versioned, immutable evidence dossier whose every number resolves from an `EvidenceRef` into an existing module (macro, industry, company facts, F3 documents, F4 judgments), with an admin editor, a disclosure-checked publish flow, drift and replay checks, an optional validated model summary, and a one-way promotion path from a private thesis.

**Architecture:** A new contract package `src/lib/evidence` (`evidence-ref/1`: ref shape, canonical hash, resolver registry, one resolver per kind behind a `EvidenceSources` port) is consumed by `src/lib/topics` (draft → assemble → disclosure check → immutable snapshot → public read with read-time masking). Storage is twelve `topic_*` tables written only through `security definer` functions and read by signed-in users only through five `security_barrier` views joined to a single-row switch. The module is closed twice: env flag `TOPICS_ENABLED` (code path) and `topic_settings.public_enabled` (data path); both default off.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, next-intl (zh/en), Supabase (PostgreSQL 17), vitest (node; `src/**/*.test.ts` only), Playwright (fixture mode), `src/components/research-ui` (shared shell, drawer, states).

**Spec (authoritative):** `docs/superpowers/specs/2026-11-16-topic-research-design.md` (merged in PR #229). Section numbers below (`§4.1`) refer to it. Where this plan departs from the spec, section 4 of this plan says so and why; anything not listed there follows the spec.

**Canvas:** "OsbornAlpha 研究板块统一设计" `https://claude.ai/artifact/SUEMb6xw32UReg6vEEtzYg`, artboards `TopicDirectory`, `TopicDossier`, `TopicEditor`, `TopicPublish`, `M-Topic`, plus `Shell`, `Drawer`, `Hub`. Read with the Artifact tool (`action: read`, `paths: ["project/<Name>.dc.html"]`). The artboards are specification sheets: one artboard may show several pages or several states side by side.

**Code baseline:** `origin/main` @ `56a0e033` (2026-11-17). Every "exists" statement in section 3 was checked on that commit.

**Status:** plan only. No implementation starts until the commander says so.

---

## 1. Owner decisions D1–D13 (accepted at the spec defaults)

Approval: owner, typed in the commander session on **2026-11-17**: "四项都同意，按新画布开始写代码". Item 4 of the four is "Topic D1-D13 accepted at the spec defaults, as drawn" (recorded in `design-restart-changes-2026-11-17.md`, section "Owner decisions: approved 2026-11-17").

| # | Decision | Accepted default | Where the plan encodes it |
|---|---|---|---|
| D1 | Who sees the directory | All signed-in users; ships with `public_enabled=false`, so only admins see a preview until the owner opens it | T1.1 (settings row), T3.2 (views return 0 rows), T3.5 (preview banner) |
| D2 | Third-party excerpt cap | ≤ 120 Chinese characters or ≤ 60 English words per fragment, ≤ 3 fragments per entry, attribution and link required | T10.4 (`EXCERPT_CAPS`), T6.3 check 6 |
| D3 | Summary metering | New usage feature `topic_summary` | T9.5 (migration + `QuotaFeature`), see X4 |
| D4 | Bare numbers in owner text | Not allowed; numbers and dates only through `{{ev:n}}` / `{{ev:n.period}}` | T2.8 (slots), T2.9 (lexical), T6.3 checks 5 and 7 |
| D5 | Categories | `macro / industry / company / cross_market / method`, enumerated in the migration | T1.1 |
| D6 | Slug | Immutable after creation, never reused, no aliases | T1.1 (trigger + unique), T6.6 (retire keeps the row) |
| D7 | FRED "non-commercial" terms | Topics show only series the macro module already serves; the rest are withheld; the macro module's posture is not widened | T2.4, see X5 |
| D8 | Attribution copy | Every drawer and the page footer show the `attribution_key` text | T4.5, T4.7 |
| D9 | Stale threshold | `TOPIC_STALE_DAYS = 90` | T3.3 |
| D10 | Withheld evidence in a published version | Allowed, shown as withheld; above 50% a warning, not a block | T6.3 check 2, T3.5 (card chip) |
| D11 | Summary LLM provider | Owner's configured provider; not public until the owner confirms its terms: `summary_public_enabled=false` blocks publishing a version with a summary | T1.2 (`topic_publish`), T9.4, T6.3 check 8 |
| D12 | Unpublished version visibility | Metadata and reason category visible (410), content not | T1.1 (view nulls `snapshot`), T3.3, T3.4 |
| D13 | Interviews / expert notes | `owner_note` only; `licensed_excerpt` not served until the owner registers a source | T10.3, T10.4 |

## 2. Standing rules (attach this section to every Codex task prompt)

- **Roles.** Fable 5.2 commands, designs, writes each task prompt and reviews the diff. **All code is written by Codex CLI `gpt-6-astra`, medium effort**, one task per call:
  ```bash
  codex exec -s workspace-write -c 'model="gpt-6-astra"' -c 'model_reasoning_effort="medium"' --skip-git-repo-check -o <out.md> - < <prompt.md>
  ```
  Prompt = this section + the task text + the files the task names. No separate audit step. The Codex sandbox cannot commit or reach PostgreSQL: the commanding session runs the PG suites and commits.
- **Engineering self-checks stay, in this order, per task:** failing test first → implementation → the task's tests → `npm run typecheck` → `npm run lint`. Per PR, before opening it: `npm run build`, the affected unit suites, the PG17 suites, and the Playwright fixture spec once it exists; then CI green.
- **PG17 commands** (macOS):
  ```bash
  LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db
  LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:migrations
  ```
  `test:db` refuses to start if any `.env*` file other than `.env.example` is in the checkout or any `PG*` / `SUPABASE_*` / `S4_TEST_STATE` variable is set. Never `pkill -f "postgres -D"`.
- **16 GB RAM: one heavy job at a time** across all worktrees (`test:db`, `test:migrations`, `npm run build`, Playwright, a Codex run). Parallel PRs in section 6 mean parallel branches, not parallel heavy jobs.
- **Migrations.** New files must sort after the latest locked one in `supabase/migrations.lock.json` (today `20261203090000_facts_read_batch_slice.sql`). Topic research owns `20261210090000` onward (section 5). Never reuse a timestamp, never edit a locked file. The lock is appended **after** the owner applies the migration to production (repo convention, see X2), never in the feature PR.
- **Do not edit any file inside the `macro_regime@v2` hashed closure.** The pinned list is in `src/lib/judgments/methodologies/macro-regime.v2.test.ts` (32 files). The ones this work comes near: `src/lib/supabase/database.types.ts`, `src/lib/industry/types.ts`, `src/lib/macro/types.ts`, `src/lib/macro/catalog.ts`, `src/lib/macro/decimal.ts`, `src/lib/facts/types.ts`, `src/lib/facts/json-numbers.ts`, `src/lib/judgments/types.ts`, `src/lib/db/table-client.ts`. Importing them is fine; changing one byte fails that test. Topic row types go in `src/lib/topics/database-types.ts`.
- **Git.** `git add <files>` then `git commit` alone on its command line (message via `-F -` heredoc; no `-n` token anywhere on the line); never `--no-verify`; never bare `git stash`. One branch per PR from `origin/main`, named `claude/topics-pr<N>-<slug>`. The owner merges.
- **No production access, deploys, env or flag changes** from implementation sessions. Owner steps are listed in section 9.
- **Closed by default.** With `TOPICS_ENABLED` unset every page is `notFound()`, every API is 404 `topics_disabled`, every cron returns `{skipped:'disabled'}`. Every PR must leave `main` in that state.
- **Fences.** Edits to shared files go inside `// TOPICS ↓` … `// TOPICS ↑` fences (JSX: `{/* TOPICS ↓ */}`), the same pattern as `// FOREIGN ↓`.
- **UI.** Tokens from `DESIGN.md` / `src/app/globals.css` only, no hex; numbers `font-mono tabular-nums`; shared components from `@/components/research-ui` (do not mount a second `ResearchChain`); every chart has the `ChartTableSwitch` table; zh and en keys identical.
- **Vocabulary.** Advice terms (买入, 卖出, 推荐, buy, sell, recommend, …) are spelled only in `src/lib/topics/lexical.ts` and its test (T2.9 enforces it by scan).
- **Tests.** vitest runs `.test.ts` only; component logic goes in a `.ts` model next to the component. A test file that contains the string `S4_TEST_STATE` must be listed in `criticalSuites` (`scripts/ci/research-checks.ts`) and vice versa.

## 3. What exists on `main` and is reused (do not rebuild)

| Need | Reuse | Notes |
|---|---|---|
| Canonical JSON + sha256 | `src/lib/macro/strategy/hash.ts` (`canonicalJson`, `sha256Hex`) | Moved to `src/lib/evidence/hash.ts`, re-exported from the old path (T2.1). Not in the hashed closure. `src/lib/broker-research/hash.ts` is a different function (numbers as strings); do not use it. |
| Drawer payload type | `src/components/research-ui/source-drawer/types.ts` (`SourceDrawerPayload`, `SourceDrawerInput`, `SourceDrawerExtras`, `EVIDENCE_KINDS`) | Identical to spec §4.1. `src/lib/evidence` re-declares the payload type structurally and a test asserts assignability both ways (lib must not import from components). |
| Drawer UI | `SourceDrawer` from `@/components/research-ui` | Variants `ok / revised / withheld / retracted` already exist. |
| States, marks, chart switch, header, footer | `StateBadge`, `StateCell`, `MarkCard`, `MarkTag`, `MarkLegend`, `ChartTableSwitch`, `lineSegments`, `PageHeader`, `FreshnessChip`, `ResearchFooter` | See X7 for the two words the shared vocabulary lacks. |
| Chain step 05 | `src/components/research-ui/chain.ts` (`CHAIN_STEPS` already has `topic`; `DEFAULT_CHAIN_AVAILABILITY.topic=false`), mounted in `src/app/(app)/layout.tsx` | T7.4 flips availability the way `readForeignPublicEnabled` does. |
| Macro observation rows | table `macro_observations`; `ObservationRow` (`src/lib/macro/types.ts`); `MacroDb.versionsOf(seriesId, periodEnd)`; series registry `seriesById` (`src/lib/macro/series-registry.ts`), `MacroSeriesDef.status`, `source.rights`, `source.attribution` | `MacroDb.observationsByIds` returns `status='ok'` rows only, so the resolver reads by id through a service `TableClient` to tell `retracted` from `not_found` (T2.4). |
| Macro drawer mapping | `src/components/macro/source-drawer-adapter.ts::macroDrawerInput` | Field-by-field model for the macro resolver's payload. |
| Typed change between two observations | `typedChange` (`src/lib/macro/strategy/facts.ts`) | Used only for `pair` facts in the summary (T9.2). |
| Number formatting | `formatSlot`, `roundDecimal` (`src/lib/macro/strategy/explain-render.ts`; note: not in `numeric.ts`) | Templates `topic.*` are added to the registry in T9.2; until then resolvers return `display.fact` slots and the page formats with `formatSlot`. |
| Lexical checks | `lexicalFailures`, `NUMERAL_PATTERNS`, `FORBIDDEN_TERMS`, `REGIME_TERMS`, `parseModelContent` (`src/lib/macro/strategy/explain-validate.ts`) | Reused as is for owner text (T2.9); `validateExplanation` is generalised in T9.1. |
| Explanation request flow | `handleExplainRequest`, `recoverExplanation`, `LlmDeps`, `costErrorCode`, `costErrorStatus` (`explain-request.ts`); `productionLlmDeps` (`llm-deps.ts`) | Skeleton extracted in T9.3. |
| Industry cells | `IndustryDb.metricRun`, `metricRowsOfRun(run, {codes, metrics, periodEnds})`, `isDatasetPublic`; `publicCell`, `runHeader`, `schemeDatasetKey`; `memoryIndustryDb`; `supabaseIndustryDb(client)` | No single-cell public reader exists; the resolver composes these (T2.5). |
| Fact eligibility | `src/lib/company/evidence-gate.ts` (`gateFacts`, `evidenceEligible`, `Eligibility`), `buildGated` (`src/lib/company/route.ts`), `WithheldReason` | No bare-id batch entry exists (spec Q2 answered): group by `(issuer_id, market)` (T2.6). |
| Facts by id | table `financial_facts`; `FactRow`; `FactsDb.factsByIds` (ok rows only under RLS) | Service read needed for `retracted` (T2.6). `market` may be `'HK'` since `20261117091000`. |
| F3 citations | `readPublicCitationById` (`src/lib/documents/citations.ts`), `DocumentsDb.citationById/documentById`, `memoryDocumentsDb` | `disclosure_documents` has no withdrawn column (X17). |
| F4 judgments | `JudgmentsDb.envelopeById`, `toCard`, `cardsOf`, `calibrationStateOf`, `lifecycleOf` (`src/lib/judgments/display.ts`), `JudgmentCard`, `MethodologyRow.publishable` | Withdrawal is a `judgment_settlements` row with `kind='withdrawn'`. |
| Freshness | `freshnessOf(client)` and `computeFreshness` (`src/lib/dq/freshness.ts`); dataset keys `macro.fred`, `macro.akshare`, `facts.us`, `facts.cn`, `industry.agg.sic`, `industry.agg.sw2021` | `dq_freshness` is service-role only. |
| Quarantine | `quarantine(client, {dataset, table, naturalKey, reasonCode, …})` (`src/lib/dq/quarantine.ts`) | New dataset key `topics.replay` (T7.2). |
| Admin guard | `requireAdminUser()` (`src/lib/admin/auth.ts`); page gate pattern `src/app/(app)/admin/broker-research/_shared/gate.tsx::adminGate` | |
| Admin route helper | pattern of `src/lib/broker-research/admin-route.ts` (`adminPost`, `adminGet`, `readJsonBody`: `Content-Type` + `Origin` checks, `jsonNoStore`) | Module-local there; T5.1 writes the topic equivalent (same behaviour, topic error class). |
| Public route helpers | `errorResponse`, `failureResponse`, `readParams`, `QueryError`, `paramErrorResponse`, `UUID_RE`, `utcDate` (`src/lib/facts/public-route.ts`); `requireSessionUser` (`src/lib/macro/route-helpers.ts`) | |
| Cron auth | `authorizedCronRequest` (`src/lib/observability/cron-auth.ts`); `resolveCodeVersion({allowGit:false})` (`src/lib/judgments/deps.ts`) | |
| DB test harness | `scripts/s4/local-db.ts`, `S4_TEST_STATE`, `describe.skipIf(!enabled)`, `asRole('anon'|'authenticated', fn)`, `pgTableClient` (`src/lib/db/pg-table-client.ts`), contract-suite pattern (`db-contract.ts` run against memory and PG) | Model: `src/lib/broker-research/broker-research.integration.test.ts`. |
| Migration idioms | `20261202090000_broker_research.sql` (singleton settings, `do $$ … revoke all … grant` loop), `…091000…` (`security definer set search_path = public`, revoke from `public, anon, authenticated`, grant `service_role`), `…092000…` (`security_invoker=false, security_barrier=true` views) | Hosted `postgres` is not a superuser: no `alter … owner`. |
| Fixture e2e | `INDUSTRY_E2E_FIXTURES` + `src/lib/industry/e2e-fixture.ts::fixtureMode` (fails closed when Supabase env or `VERCEL` is set) + `e2e/industries.spec.ts` | Topic equivalent `TOPICS_E2E_FIXTURES` (T3.6, T8.1). |
| i18n | `src/i18n/request.ts::MESSAGE_DOMAINS`; per-module parity test (model: `src/app/(app)/intel/foreign-research/messages-parity.test.ts`) | New domains go **after** the `// FOREIGN ↑` line (the `research` test pins the text between `// /F4` and `'research'`). |
| Usage metering | `checkQuota`, `beginUsageRun`, `finalizeUsageRun` (`src/lib/billing/quota.ts`), `runMeteredLlmCall` (`metered-llm.ts`), `resolveUserLlm` (`src/lib/llm/resolve.ts`) | See X4. |
| Private thesis read | `requireResearchUser()` (`src/lib/research/store.ts`) returns `{supabase, userId}` under the owner's RLS | Used only by promotion (T10.1) and disclosure check 3 (T6.3). |

## 4. Where the spec, the canvas and `main` disagree

Each row is resolved here unless marked **Question**; questions are repeated in section 10.

| # | Disagreement | Resolution in this plan |
|---|---|---|
| X1 | Spec §4.10 names migrations `20261201090000/091000/092000`. `main` already has `20261201090000_facts_read_batch.sql` and locked files up to `20261203090000`. | Use `20261210090000` onward (section 5). |
| X2 | The task brief asks for "schema + RLS + lock" in the first PR. Repo convention (runbooks, PR #258) appends to `migrations.lock.json` only after the migration is applied to production; the broker PR #252 did not touch the lock. | PR-1 does not edit the lock. After the owner applies the migrations, a one-file chore PR appends the entries (section 9, O1). |
| X3 | Spec §4.10: "hand-add Row types to `database.types.ts`". That file is in the hashed closure. | Row types live in `src/lib/topics/database-types.ts` (broker precedent, commit `e2819eda`). |
| X4 | Spec D3 says the new feature value changes "four enums / three budget functions" and `UsageFeature` (`database.types.ts:411`). On `main` the SQL list is in 2 check constraints and 5 functions (`reserve_llm_daily_budget`, `create_cap_exempt_llm_audit`, `begin_usage_run`, `finalize_usage_run`, `record_usage_event`), and `UsageFeature` cannot be edited (X3). | T9.5: one migration replaces the 2 constraints and 5 functions verbatim except the list; TypeScript widens in `src/lib/billing/quota.ts` (`export type QuotaFeature = UsageFeature | 'topic_summary'`) and `metered-llm.ts` takes `QuotaFeature`. `database.types.ts` is untouched. |
| X5 | Spec §4.1 / §10 / D7: a macro series is public when it is "in the owner-confirmed set of `docs/methodologies/licenses.json`". That file has no per-series entries (12 keys of the form `<input_kind>×<origin>`), and it must stay outside import closures. | Per-series gate = the macro catalog, which is what the macro pages already apply: `status==='restricted'` → `withheld:catalog_restricted`; `source.rights==='third_party'` → `withheld:licence_unconfirmed`; `status==='missing'` or unknown id → `missing:catalog_missing`. This keeps D7's intent ("do not widen the macro module's posture"). **Question Q-O1** asks the owner to confirm this reading. |
| X6 | Spec treats foreign research as unmerged. It is merged (PR #252, #260), closed by default. There is still no public read by `publication_id` (spec Q6 open). Canvas rows say "不支持 · 外资研报未合并". | `broker_report_meta` stays `unsupported` through PR-11; the resolver is PR-12 and needs Q6 answered. Reason code `foreign_research_unmerged` becomes `foreign_research_not_wired`; copy becomes "不支持 · 外资研报尚未接入" / "Not supported · foreign research not connected yet". |
| X7 | Canvas `TopicDossier` draws six states including 不支持 and drift words 有更新期 / 现已受限 / 无法核验. The shared vocabulary (`RESEARCH_STATES`, Shell artboard, change-list item 4) has eight words and none of these four. | No shared change. `src/components/topics/TopicBadge.tsx` delegates to `StateBadge` for `missing / withheld / notServed / retracted / revised / reconstructed / stale` and renders `unsupported`, `newer_period`, `now_withheld`, `unverifiable` locally with the same token classes and shapes (T4.3). **Question Q-D1**: should 不支持 join the shared vocabulary. |
| X8 | Spec §4.4: a trigger re-checks `snapshot_hash = sha256Hex(canonicalJson(snapshot))`. PostgreSQL cannot reproduce the TypeScript canonical form from `jsonb` (key order and escaping differ). | `topic_versions` stores `snapshot_text text` (the canonical string TypeScript produced) next to `snapshot jsonb`. Constraints: `snapshot_hash = encode(sha256(convert_to(snapshot_text,'UTF8')),'hex')` and `snapshot = snapshot_text::jsonb`. TypeScript recomputes on publish and on verify. |
| X9 | Spec §4.7 step 2 reads only `title, body`, the static guard allows only the select lists `'title,body'` and `'id'`, yet step 4 and A11 want counts for stripped fields; the canvas sidebar lists three different rows (论点事件, 私有来源文档, 备忘录引用). | A third, fixed select list is allowed: `PROMOTION_COUNT_COLUMNS` (the nine array/json columns of step 4), used once to compute lengths in memory; nothing but field names and integers is stored. The guard test pins exactly three literals. The sidebar renders the spec's field list with counts. Events and memos are not read. **Question Q-D2**: redraw the sidebar rows. |
| X10 | Canvas unpublish dialog has "内部说明（不公开）". Spec `topic_unpublish` takes only `reason`. | `topic_unpublish(…, p_note text)`; the note (≤ 200 chars, no UUID or 64-hex) is stored only in `topic_audit_log.detail.note`. |
| X11 | Spec: `retired_reason text`, and the 410 "carries the retirement reason category". Canvas retire dialog has a free-text reason and a "type the slug to confirm" field. | `topics.retired_reason` uses the unpublish enum (`error / licence / owner_request / privacy`); the free text goes to the audit note; the public 410 carries the category only; the slug confirmation is client-side. **Question Q-D3**: add the category select to the dialog. |
| X12 | Canvas licence form: 来源名称, 条款 URL, 条款摘录, 允许引文, 需要署名, 需要链接, 状态. Spec §4.6 also needs `publisher`, `source_url`, `terms_read_at`, caps, and attribution is always required (D2). | Form = canvas fields + `publisher`, `source_url`, `terms_read_at`; 需要署名 is checked and disabled; caps are read-only at the D2 values. **Question Q-D4**. |
| X13 | No artboard for opening the public switch (per-source licence confirmations, `summary_public_enabled`, provider note). Spec §6.5 body `{public_enabled}` is narrower than §4.2's function. | API only in PR-6 (`POST /api/admin/topics/settings` with the full §4.2 body); the owner operates it from the runbook (broker precedent). The chip "目录开关：未对外" is read-only. **Question Q-D5**: draw a settings screen if a UI is wanted. |
| X14 | Broker research is closed by a database row only; spec §9 wants env flag + database row. | Follow the spec: both. |
| X15 | Spec §7.1: add the entry "in the `// TOPICS` fence, same pattern as `IndustryEntryCard`". No such fence exists; the `Hub` artboard (five unified cards) is not built on `main` (foreign research is a tab link, not a card). | T7.5 adds one topic card inside new fences in `ResearchTab`, in the current card style, with the `Hub` artboard's three rows. Rebuilding `/intel` to the `Hub` artboard is out of scope. **Question Q-C1** for the commander: who owns the Hub rebuild. |
| X16 | Spec §5.4 registers the drift cron in `vercel.json`. Broker precedent leaves cron registration to the owner after merge. | Routes ship in PR-7 and return `{skipped:'disabled'}` while closed; the `vercel.json` entries are in the runbook for the owner (O3). |
| X17 | Spec: `document_citation` can be `retracted` ("document withdrawn"). `disclosure_documents` has no withdrawn state. | The resolver never returns `retracted` for this kind in v1. A document that stops being public shows as drift `now_withheld`. |
| X18 | Spec §4.1 says industry cells are `ok` for runs `active/superseded`; anon RLS only shows `active` runs. | The resolver runs with the service role and applies the licence gate (`isDatasetPublic`) in code; a superseded run whose `activated_at ≤ as_of` resolves `ok`. |
| X19 | Spec §4.1 `financial_fact` `not_served`: "issuer has only HK securities". On `main` HK facts are rows with `market='HK'`. | `row.market==='HK'` → `not_served:hk_not_served`. |
| X20 | Spec §4.10 puts every function in one file including the five summary RPCs; summary ships later (T1). | Tables all in `…090000`; core functions in `…091000` (PR-1); summary functions in `…092000` and the usage feature in `…093000` (PR-9). |
| X21 | Spec §4.2 `topic_settings.updated_by uuid not null`; the seed row has no actor. | `updated_by` nullable for the seed row; `topic_set_public_enabled` requires a non-null actor. |
| X22 | Canvas `TopicDossier` shows judgments as a separate card block "不与事实行混排"; spec sections hold one ordered list of mixed kinds. | Within a section, fact rows render in the table and `judgment` refs render as judgment cards under it; ordinals stay as assigned. |
| X23 | Canvas directory card shows "大部分数值受限" (D10) publicly; in the spec D10 is only a disclosure warning. | The chip is derived on the card from `evidence_counts` (withheld > half of all evidence). No new data. |
| X24 | `M-Topic` draws the phone dossier only. Spec §17 item 1 asks for a phone directory; no phone admin screens exist. | Directory: the three-column grid becomes one column, states unchanged. Admin pages: columns stack; no extra design. **Question Q-D6**. |
| X25 | Spec §7.3 names two admin pages; the canvas splits editing and publishing into two artboards. | Routes: `/admin/topics` (list), `/admin/topics/[id]` (editor, `TopicEditor`), `/admin/topics/[id]/publish` (check, summary, preview, dialogs, versions: `TopicPublish`), `/admin/topics/licences` (the artboard's licence block, PR-10). |
| X26 | Spec §6: public reads use the `authenticated` client. Other modules read public data with the anon client. | Topic views grant `authenticated` only (spec: no anon), so topic routes read with the session client from `getServerSupabase()`. |
| X27 | Chain step 05 for admins while the switch is off: spec silent; Hub artboard says admins see "未对外 · 预览" on the card. | Chain availability = `TOPICS_ENABLED && public_enabled` for everyone (one cached read, no per-user branch in the layout). Admins reach the preview from the hub card and `/admin/topics`. |
| X28 | Spec §13.2 e2e needs data; no seeded Supabase in CI. | Fixture mode `TOPICS_E2E_FIXTURES=1` (fails closed like the industry one); the spec runs locally and is not a CI step, same as `e2e/industries.spec.ts`. |
| X29 | Small shape additions the spec does not list. | `snapshot.counts`; `topic_settings.drift_checked_at` and `drift_cursor`; `snapshot_text` / `body_text` (X8); two extra views `topics_open_v` and `topic_licence_status_public_v` (spec names three); `topic_record_event` for the `preview` and `replay_verify` audit rows; draft evidence carries a stable `ordinal` and an optional `as_of` (`DraftRef`). Each is explained in T1.1–T1.3. |
| X30 | Spec §11: the Copilot tool is registered only when both switches are true. The tool list in `src/lib/agent/tools.ts` is a module-level constant and no tool is flag-conditional today. | Registration follows the env flag at module load; the database switch is enforced at call time by the public API (404 → the tool reports unavailable). |
| X31 | Canvas `TopicEditor` flags "建议关注" as `advice_term`; the spec's `ADVICE_TERMS` list has no "建议". | "建议" is added to `ADVICE_TERMS` (it applies to owner text and model output). UI copy such as "不构成投资建议" is not owner text and is unaffected. |
| X32 | Spec §5.4 says the drift job resumes by cursor; a Vercel cron cannot chain calls. | The cursor is stored in `topic_settings.drift_cursor`; an incomplete run does not advance `drift_checked_at`, so the 72-hour marker stays truthful. |

## 5. Migration prefixes

| File | PR | Content |
|---|---|---|
| `supabase/migrations/20261210090000_topics.sql` | PR-1 | all twelve `topic_*` tables, triggers, the five public views, privileges |
| `supabase/migrations/20261210091000_topics_functions.sql` | PR-1 | core write functions (create, draft, disclosure, publish, unpublish, retire, licence, settings, promotion, drift) |
| `supabase/migrations/20261210092000_topics_summary_functions.sql` | PR-9 | `topic_claim_summary`, `topic_record_summary_completion`, `topic_finish_summary`, `topic_mark_summary_finalized`, `topic_expire_summaries`, `topic_approve_summary` |
| `supabase/migrations/20261210093000_usage_feature_topic_summary.sql` | PR-9 | usage feature list (X4) |
| `20261210094000` … `20261219235959` | reserved | fixes; never reuse a timestamp |

Rule at PR-open time: `npm run test:db` step 1 (`migrationInventory`) fails if an unlocked file sorts at or before the highest locked one. If the lock has moved past a reserved timestamp, rename the unmerged file to the next free value above the lock and note it in the PR body.

## 6. PR sequence

Each PR is mergeable on its own and leaves `main` working with the module closed. "After" = must be merged first.

| PR | Branch | Content | After | Files it owns (no other open PR touches them) |
|---|---|---|---|---|
| PR-1 | `claude/topics-pr1-schema` | migrations, row types, `TopicsDb` port + memory / PG / Supabase adapters + contract suite, flags, i18n domains registered | — | `supabase/migrations/2026121009*`, `src/lib/topics/{flags,types,database-types,errors,db,memory-db,pg-db,db-contract}.ts`, `scripts/ci/research-checks.ts` (fence), `src/i18n/request.ts` (fence), `messages/*/topics.json`, `messages/*/topicsAdmin.json` (seed keys) |
| PR-2 | `claude/topics-pr2-evidence` | `evidence-ref/1`, hash move, resolver registry, five resolvers + stub, sources port, slots, lexical | — | `src/lib/evidence/**`, `src/lib/macro/strategy/hash.ts` (re-export), `src/lib/topics/{slots,lexical}.ts` |
| PR-3 | `claude/topics-pr3-read` | public read service, masking, `asOf`, five GET routes, directory page, fixture mode | PR-1, PR-2 | `src/lib/topics/{public-read,masking,asof,public-dto,deps,e2e-fixture}.ts`, `src/app/api/topics/**`, `src/app/(app)/intel/topics/page.tsx`, `src/components/topics/directory/**`, `messages/*/topics.json` |
| PR-4 | `claude/topics-pr4-dossier` | dossier page, version bar, sections, evidence rows, badges, drawer adapter, chart/table, entries, footer, phone | PR-3 | `src/app/(app)/intel/topics/[slug]/**`, `src/components/topics/dossier/**`, `messages/*/topics.json` |
| PR-5 | `claude/topics-pr5-editor` | admin route helper, create / draft / evidence-search routes, admin list, three-column editor | PR-1, PR-2 | `src/lib/topics/{admin-route,drafts,evidence-search}.ts`, `src/app/api/admin/topics/**` (create, draft, evidence-search), `src/app/(app)/admin/topics/**` (list, editor), `src/components/topics/admin/**`, `messages/*/topicsAdmin.json` |
| PR-6 | `claude/topics-pr6-publish` | assemble, snapshot, disclosure check, preview, publish, unpublish, retire, settings with licence gate, publish page | PR-5 (and PR-3 for the preview reusing public DTOs) | `src/lib/topics/{assemble,snapshot,disclosure,publish,settings}.ts`, admin routes for those, `src/app/(app)/admin/topics/[id]/publish/**`, `messages/*/topicsAdmin.json` |
| PR-7 | `claude/topics-pr7-jobs-entry` | drift cron, replay verify (route + cron), chain step 05, `/intel` card | PR-4, PR-6 | `src/lib/topics/{drift,verify,public-flag}.ts`, `src/app/api/cron/topic-*/**`, `src/app/(app)/layout.tsx` (fence), `src/app/(app)/intel/page.tsx` (fence), `src/components/topics/TopicEntryCard.tsx` |
| PR-8 | `claude/topics-pr8-e2e-runbook` | Playwright fixture spec, runbook, acceptance record | PR-7 | `e2e/topics.spec.ts`, `docs/runbooks/topic-research.md`, `docs/audits/2026-11-16-topic-research/acceptance.md` |
| PR-9 | `claude/topics-pr9-summary` | validator and template generalisation, request skeleton, summary storage, usage feature, generate / approve UI, summary panel data | PR-6 | `src/lib/macro/strategy/{explain-validate,explain-render,explain-request,contract}.ts`, `src/lib/topics/summary/**`, `src/lib/billing/{quota,metered-llm}.ts`, migrations `…092000`, `…093000` |
| PR-10 | `claude/topics-pr10-promotion` | promotion from a private thesis, private-fingerprint and unreviewed-block checks, thesis-page link, licence register, licensed excerpts | PR-6 | `src/lib/topics/{promote,licences,excerpts}.ts`, `src/app/(app)/research/theses/[id]/page.tsx` (one link), `src/app/(app)/admin/topics/licences/**` |
| PR-11 | `claude/topics-pr11-copilot` | `topic_dossier` Copilot tool | PR-7 | `src/lib/agent/tools.ts` (fence), `src/lib/topics/copilot.ts` |
| PR-12 | `claude/topics-pr12-broker` | `broker_report_meta` resolver; industry end-to-end acceptance | PR-2; blocked on Q6 and on industry data being published | `src/lib/evidence/resolvers/broker.ts` |

**Parallelism.** PR-1 ∥ PR-2 (no shared file). Then track A (PR-3 → PR-4, owns `topics.json`) ∥ track B (PR-5 → PR-6, owns `topicsAdmin.json`). PR-7 joins both. After PR-6, PR-9 and PR-10 can run in parallel with PR-7/PR-8 and with each other, except that both edit `src/lib/topics/disclosure.ts` and `topicsAdmin.json`: run PR-9 before PR-10. PR-9 edits macro strategy files: the commander must confirm no macro branch is open on those four files (spec Q4).

Spec phases: T0 = PR-1 … PR-8; T1 = PR-9; T2 = PR-10; T4 = PR-11; T3 = PR-12.

## 7. File structure

```
src/lib/evidence/
  ref.ts                 EvidenceRef, EvidenceKind, CONTRACT_VERSION, parseRef, canonicalRef, refHash, asOfFromDate
  hash.ts                canonicalJson, sha256Hex (moved from macro/strategy/hash.ts)
  resolve.ts             ResolveState, ResolveCtx, Resolved, LatestIdentity, EvidenceResolver, createResolver(registry)
  sources.ts             EvidenceSources port (macro, industry, facts, documents, judgments, freshness)
  memory-sources.ts      in-memory EvidenceSources for tests and fixture mode
  production-sources.ts  service-role adapters over the existing module readers
  drawer.ts              SourceDrawerPayload (structural copy) + per-kind builders
  resolvers/{macro,industry,fact,citation,judgment,broker}.ts
  fixtures/              frozen rows per kind used by contract.test.ts
  *.test.ts, contract.test.ts
src/lib/topics/
  flags.ts               topicsEnabled(), TOPIC_STALE_DAYS
  errors.ts              TopicError(code, status)
  types.ts               DraftBody, TopicSnapshot, SnapshotEvidence, TopicsDb (port), DTO row types
  database-types.ts      table row shapes (module-owned)
  db.ts                  supabaseTopicsDb({admin?, session?})
  memory-db.ts           memoryTopicsDb()
  pg-db.ts               pgTopicsDb(pool)
  db-contract.ts         topicsDbContract(label, setup)
  slots.ts               parseSlots, renderSlots
  lexical.ts             ADVICE_TERMS, ownerTextFailures
  assemble.ts            assembleSnapshot (pure) + assemble (I/O)
  snapshot.ts            snapshotText, snapshotHash, evidenceRows, countsOf
  disclosure.ts          DISCLOSURE_VERSION, runDisclosure (10 checks)
  publish.ts             publishTopic, unpublishTopic, retireTopic
  settings.ts            setPublicEnabled (licence confirmations)
  public-read.ts         listTopics, readTopic, readVersions, readVersion, readEvidence
  asof.ts                versionAtAsOf
  masking.ts             maskSnapshot (read-time masking)
  public-dto.ts          client-safe DTO types
  public-flag.ts         readTopicsPublicEnabled (cached)
  drift.ts               driftOf, runDrift
  verify.ts              verifyVersion
  promote.ts             promoteThesis (PR-10)
  licences.ts, excerpts.ts (PR-10)
  summary/               facts.ts, request.ts, db.ts, prompts/topic-summary-v1.{zh,en}.md (PR-9)
  copilot.ts             topicDossierTool (PR-11)
  admin-route.ts         adminPost, adminGet, readJsonBody, field readers
  deps.ts                publicDeps(), adminDeps(), cronDeps()
  e2e-fixture.ts         fixtureMode(), fixtureDeps()
  fixtures/              the spec's exit-criteria fixtures
src/app/api/topics/…                     five public GET routes
src/app/api/admin/topics/…               admin routes (§6.5)
src/app/api/cron/topic-drift/route.ts    daily drift
src/app/api/cron/topic-verify/route.ts   weekly replay sample
src/app/(app)/intel/topics/page.tsx, [slug]/page.tsx, [slug]/v/[n]/page.tsx
src/app/(app)/admin/topics/page.tsx, [id]/page.tsx, [id]/publish/page.tsx, licences/page.tsx, new/page.tsx
src/components/topics/{directory,dossier,admin}/…, TopicBadge.tsx, TopicEntryCard.tsx
messages/{zh,en}/topics.json        public pages
messages/{zh,en}/topicsAdmin.json   admin pages
e2e/topics.spec.ts
docs/runbooks/topic-research.md
```

## 8. Coverage

### 8.1 Spec → tasks

| Spec | Tasks |
|---|---|
| §1.1 goal 1 directory, `topic_slug` | T1.1, T3.2, T3.5 |
| §1.1 goal 2 versioned dossier | T1.1, T1.2, T6.1, T6.2, T6.5 |
| §1.1 goal 3 / §4.1 EvidenceRef contract, resolver rules 1–7, state table | T2.2–T2.7 |
| §1.1 goal 4 / §8.2 summary | T9.1–T9.7 |
| §1.1 goal 5 / §4.7 promotion | T10.1–T10.3 |
| §1.1 goal 6 first-class states | T2.3–T2.7, T3.3, T4.3 |
| §1.1 exit criteria (fixtures) | T6.7 (v1/v2 drift, `asOf`), T2.6 (CN withheld, no value in JSON), T10.2 (promotion), T9.1 (validator), T8.2 (gates) |
| §1.2 non-goals | enforced by absence; T2.9 scan (advice terms), T10.2 static guard (`research_*` writes), T2.2 (no reserved kinds) |
| §4.2 settings | T1.1, T1.2, T6.6 |
| §4.3 topics | T1.1, T1.2 |
| §4.4 versions, evidence copy, immutability | T1.1, T1.2, T1.4 |
| §4.5 drafts, number rule | T1.2, T2.8, T2.9, T5.2 |
| §4.6 entries, source licences | T1.1, T10.3, T10.4 |
| §4.7 promotions | T1.1, T10.1, T10.2 |
| §4.8 summary / receipts / audit / drift tables | T1.1, T1.2, T9.4 |
| §4.9 privileges, views, functions | T1.1, T1.2, T1.4 |
| §4.10 migrations | T1.1, T1.2, T9.4, T9.5 (X1, X3, X20) |
| §5.1 assemble | T6.1 |
| §5.2 failure semantics | T6.1 (`resolver_degraded`), T6.5 (atomic publish), T7.1 (drift failure keeps last) |
| §5.3 freshness | T2.3, T6.1, T3.3 (`TOPIC_STALE_DAYS`) |
| §5.4 drift, read-time masking | T7.1, T3.3 |
| §5.5 replay verify | T7.2, T7.3 |
| §6 common route rules, §6.1 routes | T3.4 |
| §6.2 `asOf` | T3.3 |
| §6.3 states in responses | T3.2, T3.3 |
| §6.4 drawer | T2.3 (payload), T4.5 |
| §6.5 admin routes | T5.2, T5.3 (create, draft, evidence-search), T6.4 (disclosure, preview), T6.5 (publish, unpublish), T6.6 (retire, settings), T7.2 (verify), T9.6 (summary), T10.1 (from-thesis), T10.3 (licences) |
| §6.6 ten checks | T6.3 (all ten; the private id set is injected), T10.2 (loads the real id set), T10.4 (licence-backed check 6) |
| §7.1 directory, `/intel` entry | T3.5, T7.5 |
| §7.2 dossier | T4.1–T4.8 |
| §7.3 admin | T5.4, T5.5, T6.8 |
| §7.4 thesis-page link | T10.3 |
| §8.1 no judgments of its own | T2.7 (judgment kind renders F4 cards), T9.2 (judgments excluded from summary input) |
| §8.2 reuse / generalise / new | T9.1 (validator, `ADVICE_TERMS`, `multi_sentence`), T9.2 (templates, facts, pair), T9.3 (skeleton), T9.4 (storage), T9.5 (usage), T9.6 (routes, prompts) |
| §9 switches, capability matrix | T1.3 (flag), T1.1 (settings), T8.2 (matrix check) |
| §10 licences, publish gate | T6.6 (`licence_confirmation_missing`), T2.4 (X5), T4.7 (attribution) |
| §11 Copilot | T11.1 |
| §12 dependencies | section 3 of this plan; T9 for macro refactor; T7.2 (`topics.replay`) |
| §13.1 error codes | T1.3 (`TopicError`), T3.4, T5.1 |
| §13.2 tests | each task; T1.4 (DB), T2.9 / T10.2 (static scans), T8.1 (e2e) |
| §13.3 A1–A18 | A1 T3.4, T11.1 · A2 T3.2, T3.5 · A3 T6.2 · A4 T6.7, T7.1 · A5 T3.3 · A5b T3.3 · A6 T2.6 · A7 T7.2 · A8 T2.6, T2.7, T6.3 · A9 T9.1, T9.2 · A10 T9.1–T9.3 · A11 T10.1, T10.2 · A12 T10.2 · A13 T10.2 · A14 T1.4 · A15 T7.1, T4.2 · A16 T10.4 · A17 T4.6, T1.5 · A18 T1.4 |
| §15 D1–D13 | section 1 |
| §16 Q1–Q8 | section 10 |
| §17 canvas items 1–9 | section 8.2 |

### 8.2 Artboard → tasks

| Artboard element | Tasks |
|---|---|
| `TopicDirectory`: preview banner (D1), header, title search, 管理专题 button (admins), category segment (D5) | T3.5 |
| `TopicDirectory`: card (category + version, title, dek, evidence status bar with text and counts, drift badge, stale badge D9, mostly-withheld chip D10) | T3.5 |
| `TopicDirectory`: four states (loading, empty user, empty admin, error) | T3.5 |
| `TopicDirectory`: two entry points (hub card; thesis-page button) | T7.5, T10.3 |
| `TopicDossier`: version bar (current chip, published date, cutoff, version select, replay date, 版本管理 for admins) | T4.2 |
| `TopicDossier`: three mutually exclusive banners (superseded, unpublished D12, replay) | T4.2 |
| `TopicDossier`: breadcrumb, title, category chip, dek (D4) | T4.1 |
| `TopicDossier`: summary panel (facts column, hypothesis column, citation marks, provider chip, incomparable line) | T4.8 (render), T9.7 (data) |
| `TopicDossier`: section with editor note (slots rendered), chart/table switch, evidence table (8 columns), six states, reconstruction mark, drift cells, masked row | T4.3, T4.4, T4.6 |
| `TopicDossier`: expected-evidence slot row | T4.4 |
| `TopicDossier`: judgment card block | T4.4 (X22) |
| `TopicDossier`: entries (owner note, licensed excerpt, masked excerpt) | T4.7 (owner note), T10.4 (excerpts) |
| `TopicDossier`: footer (status totals, restricted-market note, attribution D8, FRED note D7, disclaimer) | T4.7 |
| `Drawer`: six sections, six kinds, withheld / retracted / revised variants | T2.3 (payloads), T4.5 (adapter) |
| `TopicEditor`: page header chips (draft revision, slug D6, switch state) | T5.5 |
| `TopicEditor`: admin list (four status tabs, "only revised" filter, table, 新建专题) | T5.4 |
| `TopicEditor`: left column (sections, evidence, drag handle + keyboard, expected slot with reason) | T5.5 |
| `TopicEditor`: middle column (title, dek, notes, 插入证据 `{{ev:n}}`, live lint with three error kinds and "replace with slot") | T5.5, T2.8, T2.9 |
| `TopicEditor`: right column (evidence picker with five kinds + unsupported sixth, per-kind query fields, two-projection preview) | T5.3, T5.5 |
| `TopicEditor`: "not carried over" block and unreviewed-block warning | T10.3 |
| `TopicEditor`: sticky flow bar (six steps) | T5.5 (steps 1–2 link), T6.8 |
| `TopicPublish`: disclosure check table (10 rows, block / warn / pass totals) | T6.8 |
| `TopicPublish`: summary generate / approve cards, rejected reason + matched fragment, "not public yet" note | T9.6 |
| `TopicPublish`: preview (banner, difference table, masked count) | T6.8 |
| `TopicPublish`: publish dialog (counts, state distribution, slots, summary) | T6.8 |
| `TopicPublish`: unpublish dialog (reason category, internal note) | T6.8 (X10) |
| `TopicPublish`: retire dialog (slug confirm) | T6.8 (X11) |
| `TopicPublish`: versions table, verify result, mismatch note, drift detail | T6.8 (table), T7.2 (verify), T7.1 (drift detail) |
| `TopicPublish`: licence register (list + form) | T10.3 (X12) |
| `M-Topic`: chain strip, one-line version bar, stacked summary, evidence cards, expected slot, judgment card, footer, bottom tab bar | T4.9 |
| `Hub`: card 05 (published count, latest title + version, topics with revisions, "未对外 · 预览" for admins) | T7.5 (X15) |
| `Shell`: chain, page header order, legend, footer | reused from `research-ui` (T3.5, T4.1) |

---

# Tasks

Task ids are `T<PR>.<n>`. Every task ends with: run the task's tests, `npm run typecheck`, `npm run lint`, then commit the files listed (commit command alone on its line). "Expected: FAIL" lines give the failure the test must show before the implementation exists.

## PR-1: schema, privileges, storage port (branch `claude/topics-pr1-schema`)

### Task T1.1: tables, triggers, views

**Files:**
- Create: `supabase/migrations/20261210090000_topics.sql`
- Test: `src/lib/topics/topics.integration.test.ts` (created here, extended in T1.2 and T1.4)
- Modify: `scripts/ci/research-checks.ts` (append a fenced `criticalSuites.push`)

- [ ] **Step 1: Write the failing integration test (schema part)**

```ts
// src/lib/topics/topics.integration.test.ts
// Real-PG suite for topic research (spec §4, §13.2 "数据库"). Listed in criticalSuites.
import {readFileSync} from 'node:fs';
import {Pool,type PoolClient} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';

const enabled=!!process.env.S4_TEST_STATE;
const TABLES=['topic_settings','topics','topic_versions','topic_version_evidence','topic_drafts','topic_source_licences',
 'topic_promotions','topic_summary_runs','topic_summaries','topic_disclosure_receipts','topic_audit_log','topic_evidence_drift'];
const VIEWS=['topics_open_v','topics_public_v','topic_versions_public_v','topic_evidence_drift_public_v','topic_licence_status_public_v'];

describe.skipIf(!enabled)('topics schema',()=>{
 let pool:Pool;
 const asRole=async<T>(role:'anon'|'authenticated',fn:(c:PoolClient)=>Promise<T>):Promise<T>=>{
  const c=await pool.connect();
  try{await c.query('begin');await c.query(`set local role ${role}`);return await fn(c);}
  finally{await c.query('rollback').catch(()=>{});c.release();}
 };
 beforeAll(()=>{pool=new Pool({connectionString:JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8')).adminUrl});});
 afterAll(async()=>{await pool.end();});

 it('creates every table with RLS on and no client privileges',async()=>{
  for(const t of TABLES){
   const r=await pool.query(`select relrowsecurity from pg_class where oid=('public.'||$1)::regclass`,[t]);
   expect(r.rows[0]?.relrowsecurity,t).toBe(true);
   for(const role of ['anon','authenticated'] as const)
    await expect(asRole(role,c=>c.query(`select 1 from public.${t} limit 1`)),`${role} ${t}`).rejects.toThrow(/permission denied/);
  }
 });
 it('seeds the settings row closed',async()=>{
  const r=await pool.query('select public_enabled,summary_public_enabled from public.topic_settings where id=1');
  expect(r.rows).toEqual([{public_enabled:false,summary_public_enabled:false}]);
 });
 it('gives anon nothing and authenticated zero rows while the switch is off',async()=>{
  for(const v of VIEWS){
   await expect(asRole('anon',c=>c.query(`select 1 from public.${v} limit 1`)),`anon ${v}`).rejects.toThrow(/permission denied/);
   const r=await asRole('authenticated',c=>c.query(`select count(*)::int as n from public.${v}`));
   expect(r.rows[0].n,v).toBe(0);
  }
 });
 it('rejects a bad slug and a bad category',async()=>{
  const ins=(slug:string,cat:string)=>pool.query(`insert into public.topics (topic_slug,category,created_by) values ($1,$2,gen_random_uuid())`,[slug,cat]);
  await expect(ins('Bad_Slug','macro')).rejects.toThrow(/topics_slug_shape/);
  await expect(ins('ab','macro')).rejects.toThrow(/topics_slug_shape/);
  await expect(ins('ok-slug-t11','sports')).rejects.toThrow(/topics_category/);
 });
 it('never lets a slug change',async()=>{
  const {rows}=await pool.query(`insert into public.topics (topic_slug,category,created_by) values ('slug-fixed-t11','macro',gen_random_uuid()) returning topic_id`);
  await expect(pool.query(`update public.topics set topic_slug='slug-moved-t11' where topic_id=$1`,[rows[0].topic_id])).rejects.toThrow(/slug_immutable/);
 });
});
```

- [ ] **Step 2: Register the suite**

Append at the end of the `criticalSuites` pushes in `scripts/ci/research-checks.ts` (after the `// FOREIGN ↑` line):

```ts
// TOPICS ↓ topic research critical suites
criticalSuites.push('src/lib/topics/topics.integration.test.ts');
// TOPICS ↑
```

- [ ] **Step 3: Run it to see it fail**

Run: `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db`
Expected: FAIL in `topics schema` with `relation "public.topic_settings" does not exist`.

- [ ] **Step 4: Write the migration**

```sql
-- supabase/migrations/20261210090000_topics.sql
-- Topic research (spec 2026-11-16 §4.2–§4.9): twelve tables, immutability triggers, five public views.
-- Trigger errors carry the code as the message prefix. Hosted `postgres` is not a superuser: no
-- `alter … owner`. Replayable: create table if not exists, create or replace, drop trigger if exists.

-- ---------------------------------------------------------------- 4.2 settings
create table if not exists public.topic_settings (
  id                     integer primary key,
  public_enabled         boolean not null default false,
  summary_public_enabled boolean not null default false,
  summary_provider_note  text,
  drift_checked_at       timestamptz,
  drift_cursor           jsonb,
  updated_by             uuid,
  updated_at             timestamptz not null default now(),
  constraint topic_settings_singleton check (id = 1),
  constraint topic_settings_note check (summary_provider_note is null or length(summary_provider_note) between 1 and 500),
  constraint topic_settings_summary_note check (not summary_public_enabled or summary_provider_note is not null)
);
insert into public.topic_settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------- 4.3 topics
create table if not exists public.topics (
  topic_id           uuid primary key default gen_random_uuid(),
  topic_slug         text not null,
  category           text not null,
  status             text not null default 'draft',
  current_version_id uuid,
  retired_at         timestamptz,
  retired_reason     text,
  created_by         uuid not null,
  created_at         timestamptz not null default now(),
  constraint topics_slug_key unique (topic_slug),
  constraint topics_slug_shape check (topic_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(topic_slug) between 3 and 64),
  constraint topics_category check (category in ('macro','industry','company','cross_market','method')),
  constraint topics_status check (status in ('draft','published','unpublished','retired')),
  constraint topics_retired check ((status = 'retired') = (retired_at is not null) and (retired_at is null) = (retired_reason is null)),
  constraint topics_retired_reason check (retired_reason is null or retired_reason in ('error','licence','owner_request','privacy'))
);

-- ---------------------------------------------------------------- 4.6 source licences
create table if not exists public.topic_source_licences (
  licence_id    uuid primary key default gen_random_uuid(),
  source_title  text not null check (length(source_title) between 1 and 200),
  publisher     text not null check (length(publisher) between 1 and 200),
  source_url    text not null check (source_url ~ '^https://'),
  terms_url     text not null check (terms_url ~ '^https://'),
  terms_read_at date not null,
  terms_clause  text not null check (length(terms_clause) between 1 and 200),
  permits       jsonb not null check (jsonb_typeof(permits) = 'object'),
  status        text not null default 'pending' check (status in ('pending','approved','revoked')),
  decided_by    uuid not null,
  decided_at    timestamptz not null default now(),
  note          text
);

-- ---------------------------------------------------------------- 4.5 drafts
create table if not exists public.topic_drafts (
  draft_id   uuid primary key default gen_random_uuid(),
  topic_id   uuid not null unique references public.topics(topic_id) on delete restrict,
  revision   integer not null check (revision >= 1),
  body       jsonb not null,
  body_text  text not null,
  draft_hash text not null,
  updated_by uuid not null,
  updated_at timestamptz not null default now(),
  constraint topic_drafts_hash check (draft_hash = encode(sha256(convert_to(body_text, 'UTF8')), 'hex')),
  constraint topic_drafts_body check (body = body_text::jsonb)
);

-- ---------------------------------------------------------------- 4.7 promotions (no FK to research_*)
create table if not exists public.topic_promotions (
  promotion_id        uuid primary key default gen_random_uuid(),
  topic_id            uuid not null references public.topics(topic_id) on delete restrict,
  source_kind         text not null check (source_kind in ('research_thesis')),
  source_id           uuid not null,
  source_content_hash text not null check (source_content_hash ~ '^[0-9a-f]{64}$'),
  copied              jsonb not null,
  stripped            jsonb not null,
  actor               uuid not null,
  created_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------- 4.8 summary, receipts, audit
create table if not exists public.topic_summary_runs (
  run_id            uuid primary key default gen_random_uuid(),
  topic_id          uuid not null references public.topics(topic_id) on delete restrict,
  draft_hash        text not null check (draft_hash ~ '^[0-9a-f]{64}$'),
  locale            text not null check (locale in ('zh','en')),
  request_id        uuid not null,
  payload_hash      text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  state             text not null check (state in ('running','accepted','rejected','failed','abandoned')),
  manifest          jsonb not null,
  raw_output        jsonb,
  validation        jsonb,
  finalize_payload  jsonb,
  finalized         boolean not null default false,
  usage_audit_key   text not null unique,
  prompt_version    text not null,
  validator_version text not null,
  provider          text,
  model             text,
  actor             uuid not null,
  claimed_at        timestamptz not null default now(),
  finished_at       timestamptz,
  constraint topic_summary_runs_request unique (actor, request_id),
  constraint topic_summary_runs_audit_key check (usage_audit_key = run_id::text)
);
create table if not exists public.topic_summaries (
  summary_id  uuid primary key default gen_random_uuid(),
  run_id      uuid not null unique references public.topic_summary_runs(run_id) on delete restrict,
  topic_id    uuid not null references public.topics(topic_id) on delete restrict,
  draft_hash  text not null check (draft_hash ~ '^[0-9a-f]{64}$'),
  locale      text not null check (locale in ('zh','en')),
  rendered    jsonb not null,
  status      text not null default 'generated' check (status in ('generated','approved','discarded')),
  approved_by uuid,
  approved_at timestamptz,
  constraint topic_summaries_approved check ((status = 'approved') = (approved_by is not null and approved_at is not null))
);
create unique index if not exists topic_summaries_one_approved on public.topic_summaries(topic_id, draft_hash, locale) where status = 'approved';
create table if not exists public.topic_disclosure_receipts (
  receipt_id   uuid primary key default gen_random_uuid(),
  topic_id     uuid not null references public.topics(topic_id) on delete restrict,
  draft_hash   text not null check (draft_hash ~ '^[0-9a-f]{64}$'),
  checks       jsonb not null check (jsonb_typeof(checks) = 'array'),
  passed       boolean not null,
  code_version text not null,
  actor        uuid not null,
  created_at   timestamptz not null default now()
);
create table if not exists public.topic_audit_log (
  id         bigserial primary key,
  topic_id   uuid,
  actor      uuid not null,
  action     text not null check (action in ('create','draft_save','promote','disclosure_check','summary_run','summary_approve','preview','publish','unpublish','retire','licence_change','settings_change','replay_verify')),
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- 4.4 versions (X8: snapshot_text carries the canonical string)
create table if not exists public.topic_versions (
  version_id            uuid primary key default gen_random_uuid(),
  topic_id              uuid not null references public.topics(topic_id) on delete restrict,
  version_no            integer not null check (version_no >= 1),
  contract_version      text not null check (contract_version = 'evidence-ref/1'),
  cutoff                timestamptz not null,
  snapshot              jsonb not null,
  snapshot_text         text not null,
  snapshot_hash         text not null,
  summary_id            uuid references public.topic_summaries(summary_id) on delete restrict,
  disclosure_receipt_id uuid not null references public.topic_disclosure_receipts(receipt_id) on delete restrict,
  promotion_id          uuid references public.topic_promotions(promotion_id) on delete restrict,
  published_at          timestamptz not null default now(),
  published_by          uuid not null,
  supersedes_version_id uuid references public.topic_versions(version_id) on delete restrict,
  unpublished_at        timestamptz,
  unpublish_reason      text,
  constraint topic_versions_no unique (topic_id, version_no),
  constraint topic_versions_hash check (snapshot_hash = encode(sha256(convert_to(snapshot_text, 'UTF8')), 'hex')),
  constraint topic_versions_snapshot check (snapshot = snapshot_text::jsonb),
  constraint topic_versions_unpublish check ((unpublished_at is null) = (unpublish_reason is null)),
  constraint topic_versions_unpublish_reason check (unpublish_reason is null or unpublish_reason in ('error','licence','owner_request','privacy'))
);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'topics_current_version_fk') then
    alter table public.topics add constraint topics_current_version_fk foreign key (current_version_id) references public.topic_versions(version_id) on delete restrict;
  end if;
end $$;
create table if not exists public.topic_version_evidence (
  version_id  uuid not null references public.topic_versions(version_id) on delete restrict,
  ordinal     integer not null check (ordinal >= 1),
  kind        text not null check (kind in ('macro_observation','industry_metric','financial_fact','document_citation','broker_report_meta','judgment')),
  ref         jsonb not null,
  ref_hash    text not null check (ref_hash ~ '^[0-9a-f]{64}$'),
  as_of       timestamptz not null,
  state       text not null check (state in ('ok','missing','withheld','not_served','unsupported','retracted')),
  digest      text check (digest is null or digest ~ '^[0-9a-f]{64}$'),
  section_key text not null,
  primary key (version_id, ordinal),
  constraint topic_version_evidence_ref unique (version_id, ref_hash),
  constraint topic_version_evidence_digest check ((state = 'ok') = (digest is not null))
);
create index if not exists topic_version_evidence_kind_idx on public.topic_version_evidence(kind, ref_hash);
create table if not exists public.topic_evidence_drift (
  version_id       uuid not null,
  ordinal          integer not null,
  checked_at       timestamptz not null,
  drift            text not null check (drift in ('unchanged','revised','newer_period','retracted','now_withheld','unverifiable')),
  current_identity jsonb,
  primary key (version_id, ordinal),
  foreign key (version_id, ordinal) references public.topic_version_evidence(version_id, ordinal) on delete restrict
);

-- ---------------------------------------------------------------- triggers
create or replace function public.topic_slug_immutable() returns trigger language plpgsql as $$
begin
  if new.topic_slug is distinct from old.topic_slug then raise exception 'slug_immutable'; end if;
  return new;
end $$;
drop trigger if exists topics_slug_immutable on public.topics;
create trigger topics_slug_immutable before update on public.topics for each row execute function public.topic_slug_immutable();

create or replace function public.topic_versions_immutable() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'append_only:topic_versions'; end if;
  if old.unpublished_at is not null then raise exception 'append_only:topic_versions'; end if;
  if (to_jsonb(new) - 'unpublished_at' - 'unpublish_reason') is distinct from (to_jsonb(old) - 'unpublished_at' - 'unpublish_reason') then
    raise exception 'append_only:topic_versions';
  end if;
  return new;
end $$;
drop trigger if exists topic_versions_immutable on public.topic_versions;
create trigger topic_versions_immutable before update or delete on public.topic_versions for each row execute function public.topic_versions_immutable();

create or replace function public.topic_append_only() returns trigger language plpgsql as $$
begin raise exception 'append_only:%', tg_table_name; end $$;
do $$ declare t text; begin
  foreach t in array array['topic_version_evidence','topic_disclosure_receipts','topic_audit_log','topic_promotions'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_append_only', t);
    execute format('create trigger %I before update or delete on public.%I for each row execute function public.topic_append_only()', t || '_append_only', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- 4.9 public views (authenticated only; every view joins the switch)
create or replace view public.topics_open_v with (security_invoker = false, security_barrier = true) as
select true as open from public.topic_settings s where s.id = 1 and s.public_enabled;

create or replace view public.topics_public_v with (security_invoker = false, security_barrier = true) as
select t.topic_id, t.topic_slug, t.category, t.status, t.retired_reason,
       v.version_id as current_version_id, v.version_no, v.published_at, v.cutoff,
       v.snapshot -> 'topic' -> 'title' ->> 'zh' as title_zh, v.snapshot -> 'topic' -> 'title' ->> 'en' as title_en,
       v.snapshot -> 'topic' -> 'dek' ->> 'zh' as dek_zh, v.snapshot -> 'topic' -> 'dek' ->> 'en' as dek_en,
       v.snapshot -> 'counts' as evidence_counts, s.drift_checked_at
from public.topics t
join public.topic_settings s on s.id = 1
left join public.topic_versions v on v.version_id = t.current_version_id and v.unpublished_at is null
where s.public_enabled and t.status in ('published','unpublished','retired');

create or replace view public.topic_versions_public_v with (security_invoker = false, security_barrier = true) as
select v.version_id, v.topic_id, t.topic_slug, v.version_no, v.cutoff, v.published_at, v.supersedes_version_id,
       v.unpublished_at, v.unpublish_reason, v.snapshot_hash,
       case when v.unpublished_at is null then v.snapshot end as snapshot
from public.topic_versions v
join public.topics t on t.topic_id = v.topic_id
join public.topic_settings s on s.id = 1
where s.public_enabled;

create or replace view public.topic_evidence_drift_public_v with (security_invoker = false, security_barrier = true) as
select d.version_id, d.ordinal, d.checked_at, d.drift, d.current_identity
from public.topic_evidence_drift d
join public.topic_versions v on v.version_id = d.version_id and v.unpublished_at is null
join public.topic_settings s on s.id = 1
where s.public_enabled;

create or replace view public.topic_licence_status_public_v with (security_invoker = false, security_barrier = true) as
select l.licence_id, l.status
from public.topic_source_licences l
join public.topic_settings s on s.id = 1
where s.public_enabled;

-- ---------------------------------------------------------------- privileges
do $$ declare t text; begin
  foreach t in array array['topic_settings','topics','topic_versions','topic_version_evidence','topic_drafts','topic_source_licences',
    'topic_promotions','topic_summary_runs','topic_summaries','topic_disclosure_receipts','topic_audit_log','topic_evidence_drift'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
    execute format('grant select on public.%I to service_role', t);
  end loop;
  foreach t in array array['topics_open_v','topics_public_v','topic_versions_public_v','topic_evidence_drift_public_v','topic_licence_status_public_v'] loop
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
    execute format('grant select on public.%I to authenticated, service_role', t);
  end loop;
end $$;
revoke execute on function public.topic_slug_immutable(), public.topic_versions_immutable(), public.topic_append_only() from public, anon, authenticated, service_role;
```

Notes for the implementer: the service role gets `select` only; every write goes through the functions of T1.2. Additions to the spec's shapes (X29): `snapshot -> 'counts'`, `drift_checked_at` and `drift_cursor` (directory counts, the 72-hour rule, resumable drift), `topics_open_v` (lets a signed-in reader tell "switch off" (404) from "open but empty" (empty state) without reading settings), and `topic_licence_status_public_v` (§4.6: the read path joins the licence status).

- [ ] **Step 5: Run the suite**

Run: `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db`
Expected: `topics schema` 5 passed; the summary lists `src/lib/topics/topics.integration.test.ts` among critical suites with no skips.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261210090000_topics.sql src/lib/topics/topics.integration.test.ts scripts/ci/research-checks.ts
```
```bash
git commit -F - <<'EOF'
feat(topics): tables, immutability triggers and public views

Co-Authored-By: Codex gpt-6-astra <noreply@openai.com>
EOF
```

### Task T1.2: write functions

**Files:**
- Create: `supabase/migrations/20261210091000_topics_functions.sql`
- Modify: `src/lib/topics/topics.integration.test.ts`

Functions (all `language plpgsql security definer set search_path = public`, `revoke execute … from public, anon, authenticated`, `grant execute … to service_role`; errors are `raise exception '<code>'`):

| Function | Returns | Rules |
|---|---|---|
| `topic_audit(p_topic uuid, p_actor uuid, p_action text, p_detail jsonb)` | `void` | internal; revoked from `service_role` too; inserts one `topic_audit_log` row |
| `topic_create(p_slug text, p_category text, p_body_text text, p_actor uuid)` | `jsonb {topic_id, revision, draft_hash}` | unique violation → `slug_taken`; inserts topic + draft revision 1; audit `create` |
| `topic_save_draft(p_topic_id uuid, p_expected_revision int, p_body_text text, p_actor uuid)` | `jsonb {revision, draft_hash}` | locks the draft; missing → `not_found`; retired topic → `topic_retired`; revision differs → `revision_conflict`; audit `draft_save` with `{revision, draft_hash}` |
| `topic_record_disclosure(p_topic_id uuid, p_draft_hash text, p_checks jsonb, p_passed boolean, p_code_version text, p_actor uuid)` | `uuid` | insert; audit `disclosure_check` with `{receipt_id, passed, blocked:[codes]}` |
| `topic_publish(p_topic_id uuid, p_expected_draft_hash text, p_snapshot_text text, p_evidence jsonb, p_summary_id uuid, p_receipt_id uuid, p_cutoff timestamptz, p_actor uuid)` | `jsonb {version_id, version_no}` | body below |
| `topic_unpublish(p_topic_id uuid, p_reason text, p_note text, p_actor uuid)` | `jsonb {current_version_no}` | body below |
| `topic_retire(p_topic_id uuid, p_reason text, p_note text, p_actor uuid)` | `void` | already retired → `topic_retired`; sets `status='retired', retired_at=now(), retired_reason=p_reason`; audit `retire` |
| `topic_set_licence(p_licence_id uuid, p_fields jsonb, p_actor uuid)` | `uuid` | insert when `p_licence_id` is null, else update all columns from `p_fields`; audit `licence_change` with `{licence_id, status}` |
| `topic_set_public_enabled(p_public_enabled boolean, p_summary_public_enabled boolean, p_summary_provider_note text, p_licence_confirmations jsonb, p_actor uuid)` | `jsonb` (the settings row) | when `p_public_enabled`: every distinct `resolved.drawer.attribution_key` of `state='ok'` evidence in the current version of every `published` topic must be a key of `p_licence_confirmations` whose value has non-empty `terms_url` and `confirmed_on`; else `licence_confirmation_missing`. Audit `settings_change` with the confirmations |
| `topic_record_promotion(p_topic_id uuid, p_source_id uuid, p_source_content_hash text, p_copied jsonb, p_stripped jsonb, p_actor uuid)` | `uuid` | insert; audit `promote` with `{promotion_id}` only |
| `topic_upsert_drift(p_rows jsonb, p_checked_at timestamptz, p_complete boolean, p_cursor jsonb)` | `integer` | upsert each `{version_id, ordinal, drift, current_identity}`; when `p_complete`, set `drift_checked_at = p_checked_at` and `drift_cursor = null`; otherwise set `drift_cursor = p_cursor` and leave `drift_checked_at` alone |
| `topic_record_event(p_topic_id uuid, p_actor uuid, p_action text, p_detail jsonb)` | `void` | `p_action` must be `preview` or `replay_verify` (else `invalid_action`); writes the audit row. The system actor for crons is the nil UUID |

- [ ] **Step 1: Add the failing tests**

Append to `src/lib/topics/topics.integration.test.ts` a second `describe.skipIf(!enabled)('topics functions', …)` with the same `pool`/`asRole` setup and these helpers and cases:

```ts
import {createHash,randomUUID} from 'node:crypto';
const sha=(s:string)=>createHash('sha256').update(s,'utf8').digest('hex');
const ACTOR=randomUUID();
const body=(title:string)=>JSON.stringify({blocks_provenance:{},dek:{en:'',zh:''},entries:[],evidence:[],expected_slots:[],sections:[],title:{en:title,zh:title}});
const evRow=(ordinal:number,state='ok')=>({ordinal,kind:'macro_observation',ref:{v:1,kind:'macro_observation',id:randomUUID(),as_of:'2026-11-01T00:00:00.000Z'},
 ref_hash:sha(`ref-${ordinal}-${randomUUID()}`),as_of:'2026-11-01T00:00:00.000Z',state,digest:state==='ok'?sha(`d-${ordinal}`):null,section_key:'s1'});
const snapshotOf=(slug:string,rows:ReturnType<typeof evRow>[],extra:Record<string,unknown>={})=>JSON.stringify({contract_version:'evidence-ref/1',counts:{ok:rows.length},
 evidence:rows.map(r=>({ordinal:r.ordinal,ref:r.ref,ref_hash:r.ref_hash,section_key:r.section_key,
  resolved:{state:r.state,display:{fact:r.state==='ok'?{template:'topic.macro_level',slots:{value:{value_text:'4.3',unit:'pct'}}}:null},drawer:{attribution_key:'macro:attribution'}}})),
 topic:{slug,category:'macro',title:{zh:'t',en:'t'},dek:{zh:'',en:''}},...extra});
async function draftTopic(slug:string){
 const b=body(slug);
 const {rows}=await pool.query(`select public.topic_create($1,'macro',$2,$3) as r`,[slug,b,ACTOR]);
 return {topicId:rows[0].r.topic_id as string,draftHash:sha(b)};
}
async function publish(slug:string,rows=[evRow(1)],snapshotExtra:Record<string,unknown>={}){
 const t=await draftTopic(slug);
 const rc=await pool.query(`select public.topic_record_disclosure($1,$2,'[]'::jsonb,true,'test',$3) as id`,[t.topicId,t.draftHash,ACTOR]);
 const snap=snapshotOf(slug,rows,snapshotExtra);
 const r=await pool.query(`select public.topic_publish($1,$2,$3,$4::jsonb,null,$5,'2026-11-10T00:00:00Z',$6) as r`,[t.topicId,t.draftHash,snap,JSON.stringify(rows),rc.rows[0].id,ACTOR]);
 return {...t,snap,versionId:r.rows[0].r.version_id as string,versionNo:r.rows[0].r.version_no as number};
}

it('topic_create stores the draft hash of the text it was given and rejects a reused slug (A18)',async()=>{
 const t=await draftTopic('fn-create-a');
 const d=await pool.query('select revision,draft_hash from public.topic_drafts where topic_id=$1',[t.topicId]);
 expect(d.rows[0]).toEqual({revision:1,draft_hash:t.draftHash});
 await pool.query(`select public.topic_retire($1,'owner_request',null,$2)`,[t.topicId,ACTOR]);
 await expect(draftTopic('fn-create-a')).rejects.toThrow(/slug_taken/);
});
it('topic_save_draft enforces the expected revision',async()=>{
 const t=await draftTopic('fn-save-a');
 await pool.query(`select public.topic_save_draft($1,1,$2,$3)`,[t.topicId,body('x'),ACTOR]);
 await expect(pool.query(`select public.topic_save_draft($1,1,$2,$3)`,[t.topicId,body('y'),ACTOR])).rejects.toThrow(/revision_conflict/);
});
it('topic_publish writes version 1, the evidence copy and the topic pointer in one call',async()=>{
 const p=await publish('fn-publish-a',[evRow(1),evRow(2,'withheld')]);
 expect(p.versionNo).toBe(1);
 const ev=await pool.query('select ordinal,state from public.topic_version_evidence where version_id=$1 order by ordinal',[p.versionId]);
 expect(ev.rows).toEqual([{ordinal:1,state:'ok'},{ordinal:2,state:'withheld'}]);
 const t=await pool.query('select status,current_version_id from public.topics where topic_id=$1',[p.topicId]);
 expect(t.rows[0]).toEqual({status:'published',current_version_id:p.versionId});
});
it.each([
 ['a stale draft hash','publish_blocked:draft_changed',{hash:'0'.repeat(64)}],
 ['an admin projection','publish_blocked:admin_projection',{extra:{admin_only:true}}],
 ['a withheld item that still carries a fact','publish_blocked:restricted_value',{leak:true}],
 ['evidence rows that differ from the snapshot','publish_blocked:evidence_mismatch',{dropRow:true}],
] as const)('topic_publish refuses %s',async(_n,code,o)=>{
 const slug=`fn-block-${code.split(':')[1].replace(/_/g,'-')}`;
 const t=await draftTopic(slug);
 const rc=await pool.query(`select public.topic_record_disclosure($1,$2,'[]'::jsonb,true,'test',$3) as id`,[t.topicId,t.draftHash,ACTOR]);
 const rows=[evRow(1),evRow(2,'withheld')];
 let snap=snapshotOf(slug,rows,'extra' in o?o.extra:{});
 if('leak' in o){const j=JSON.parse(snap);j.evidence[1].resolved.display.fact={template:'x',slots:{}};snap=JSON.stringify(j);}
 await expect(pool.query(`select public.topic_publish($1,$2,$3,$4::jsonb,null,$5,'2026-11-10T00:00:00Z',$6)`,
  [t.topicId,'hash' in o?o.hash:t.draftHash,snap,JSON.stringify('dropRow' in o?rows.slice(0,1):rows),rc.rows[0].id,ACTOR])).rejects.toThrow(code);
});
it('topic_publish refuses a failed receipt and a summary while the summary switch is off (D11)',async()=>{
 const t=await draftTopic('fn-block-receipt');
 const bad=await pool.query(`select public.topic_record_disclosure($1,$2,'[]'::jsonb,false,'test',$3) as id`,[t.topicId,t.draftHash,ACTOR]);
 const rows=[evRow(1)];
 await expect(pool.query(`select public.topic_publish($1,$2,$3,$4::jsonb,null,$5,'2026-11-10T00:00:00Z',$6)`,
  [t.topicId,t.draftHash,snapshotOf('fn-block-receipt',rows),JSON.stringify(rows),bad.rows[0].id,ACTOR])).rejects.toThrow('publish_blocked:disclosure_receipt');
 const ok=await pool.query(`select public.topic_record_disclosure($1,$2,'[]'::jsonb,true,'test',$3) as id`,[t.topicId,t.draftHash,ACTOR]);
 await expect(pool.query(`select public.topic_publish($1,$2,$3,$4::jsonb,$7,$5,'2026-11-10T00:00:00Z',$6)`,
  [t.topicId,t.draftHash,snapshotOf('fn-block-receipt',rows),JSON.stringify(rows),ok.rows[0].id,ACTOR,randomUUID()])).rejects.toThrow('publish_blocked:summary_provider_unconfirmed');
});
it('versions are immutable except the one-time unpublish columns (A14)',async()=>{
 const p=await publish('fn-immutable-a');
 await expect(pool.query(`update public.topic_versions set cutoff=now() where version_id=$1`,[p.versionId])).rejects.toThrow(/append_only:topic_versions/);
 await expect(pool.query(`delete from public.topic_versions where version_id=$1`,[p.versionId])).rejects.toThrow(/append_only:topic_versions/);
 await expect(pool.query(`update public.topic_version_evidence set state='missing' where version_id=$1`,[p.versionId])).rejects.toThrow(/append_only:topic_version_evidence/);
 await expect(pool.query(`delete from public.topic_version_evidence where version_id=$1`,[p.versionId])).rejects.toThrow(/append_only:topic_version_evidence/);
 await pool.query(`select public.topic_unpublish($1,'error','note',$2)`,[p.topicId,ACTOR]);
 await expect(pool.query(`update public.topic_versions set unpublish_reason='privacy' where version_id=$1`,[p.versionId])).rejects.toThrow(/append_only:topic_versions/);
});
it('unpublish falls back to the previous live version, then to status unpublished',async()=>{
 const p=await publish('fn-unpublish-a');
 await pool.query(`select public.topic_save_draft($1,1,$2,$3)`,[p.topicId,body('v2'),ACTOR]);
 const h2=sha(body('v2'));
 const rc=await pool.query(`select public.topic_record_disclosure($1,$2,'[]'::jsonb,true,'test',$3) as id`,[p.topicId,h2,ACTOR]);
 const rows=[evRow(1)];
 await pool.query(`select public.topic_publish($1,$2,$3,$4::jsonb,null,$5,'2026-11-11T00:00:00Z',$6)`,[p.topicId,h2,snapshotOf('fn-unpublish-a',rows),JSON.stringify(rows),rc.rows[0].id,ACTOR]);
 const u1=await pool.query(`select public.topic_unpublish($1,'error',null,$2) as r`,[p.topicId,ACTOR]);
 expect(u1.rows[0].r.current_version_no).toBe(1);
 const u2=await pool.query(`select public.topic_unpublish($1,'error',null,$2) as r`,[p.topicId,ACTOR]);
 expect(u2.rows[0].r.current_version_no).toBeNull();
 expect((await pool.query('select status from public.topics where topic_id=$1',[p.topicId])).rows[0].status).toBe('unpublished');
});
it('the public views open with the switch and hide unpublished snapshots (D1, D12)',async()=>{
 const p=await publish('fn-view-a');
 const lock=await pool.connect();
 try{
  await lock.query(`select pg_advisory_lock(hashtext('topic_settings'))`);
  await pool.query(`select public.topic_set_public_enabled(true,false,null,'{"macro:attribution":{"terms_url":"https://fred.stlouisfed.org/legal/","confirmed_on":"2026-11-17"}}'::jsonb,$1)`,[ACTOR]);
  const seen=await asRole('authenticated',c=>c.query(`select version_no,title_zh from public.topics_public_v where topic_slug='fn-view-a'`));
  expect(seen.rows).toEqual([{version_no:1,title_zh:'t'}]);
  await pool.query(`select public.topic_unpublish($1,'privacy',null,$2)`,[p.topicId,ACTOR]);
  const v=await asRole('authenticated',c=>c.query(`select snapshot,unpublish_reason from public.topic_versions_public_v where version_id=$1`,[p.versionId]));
  expect(v.rows).toEqual([{snapshot:null,unpublish_reason:'privacy'}]);
 }finally{
  await pool.query(`update public.topic_settings set public_enabled=false,summary_public_enabled=false,summary_provider_note=null where id=1`);
  await lock.query(`select pg_advisory_unlock(hashtext('topic_settings'))`);lock.release();
 }
});
it('opening the switch needs a confirmation for every attribution in use (§10)',async()=>{
 await publish('fn-licence-gate');
 await expect(pool.query(`select public.topic_set_public_enabled(true,false,null,'{}'::jsonb,$1)`,[ACTOR])).rejects.toThrow(/licence_confirmation_missing/);
});
it('functions are not callable by client roles',async()=>{
 for(const role of ['anon','authenticated'] as const)
  await expect(asRole(role,c=>c.query(`select public.topic_retire(gen_random_uuid(),'error',null,gen_random_uuid())`))).rejects.toThrow(/permission denied/);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db`
Expected: FAIL in `topics functions` with `function public.topic_create(unknown, unknown, unknown, unknown) does not exist`.

- [ ] **Step 3: Write the migration**

The two functions with the most rules, in full; write the others from the table above in the same idiom.

```sql
-- supabase/migrations/20261210091000_topics_functions.sql
create or replace function public.topic_publish(p_topic_id uuid, p_expected_draft_hash text, p_snapshot_text text, p_evidence jsonb,
  p_summary_id uuid, p_receipt_id uuid, p_cutoff timestamptz, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.topics; d public.topic_drafts; r public.topic_disclosure_receipts; v_snap jsonb; v_no int; v_id uuid; v_bad int;
begin
  if p_actor is null then raise exception 'invalid_actor'; end if;
  select * into t from public.topics where topic_id = p_topic_id for update;
  if not found then raise exception 'not_found'; end if;
  if t.status = 'retired' then raise exception 'topic_retired'; end if;
  select * into d from public.topic_drafts where topic_id = p_topic_id for update;
  if d.draft_hash is distinct from p_expected_draft_hash then raise exception 'publish_blocked:draft_changed'; end if;
  select * into r from public.topic_disclosure_receipts where receipt_id = p_receipt_id;
  if not found or r.topic_id <> p_topic_id or not r.passed or r.draft_hash <> d.draft_hash then raise exception 'publish_blocked:disclosure_receipt'; end if;
  if position('"admin_only"' in p_snapshot_text) > 0 then raise exception 'publish_blocked:admin_projection'; end if;
  v_snap := p_snapshot_text::jsonb;
  select count(*) into v_bad from jsonb_array_elements(v_snap -> 'evidence') e
   where e -> 'resolved' ->> 'state' <> 'ok' and coalesce(jsonb_typeof(e -> 'resolved' -> 'display' -> 'fact'), 'null') <> 'null';
  if v_bad > 0 then raise exception 'publish_blocked:restricted_value'; end if;
  if jsonb_array_length(p_evidence) <> jsonb_array_length(v_snap -> 'evidence') then raise exception 'publish_blocked:evidence_mismatch'; end if;
  select count(*) into v_bad
   from jsonb_array_elements(v_snap -> 'evidence') with ordinality as s(e, i)
   join jsonb_array_elements(p_evidence) with ordinality as p(e, i) using (i)
   where s.e ->> 'ref_hash' is distinct from p.e ->> 'ref_hash' or s.e ->> 'ordinal' is distinct from p.e ->> 'ordinal'
      or s.e -> 'resolved' ->> 'state' is distinct from p.e ->> 'state';
  if v_bad > 0 then raise exception 'publish_blocked:evidence_mismatch'; end if;
  if exists (select 1 from jsonb_array_elements(p_evidence) e where (e ->> 'as_of')::timestamptz > p_cutoff) then raise exception 'publish_blocked:as_of_after_cutoff'; end if;
  if p_summary_id is not null then
    if not (select summary_public_enabled from public.topic_settings where id = 1) then raise exception 'publish_blocked:summary_provider_unconfirmed'; end if;
    if not exists (select 1 from public.topic_summaries where summary_id = p_summary_id and topic_id = p_topic_id and status = 'approved' and draft_hash = d.draft_hash) then
      raise exception 'publish_blocked:summary_mismatch';
    end if;
  end if;
  select coalesce(max(version_no), 0) + 1 into v_no from public.topic_versions where topic_id = p_topic_id;
  insert into public.topic_versions (topic_id, version_no, contract_version, cutoff, snapshot, snapshot_text, snapshot_hash, summary_id,
    disclosure_receipt_id, promotion_id, published_by, supersedes_version_id)
  values (p_topic_id, v_no, 'evidence-ref/1', p_cutoff, v_snap, p_snapshot_text, encode(sha256(convert_to(p_snapshot_text, 'UTF8')), 'hex'), p_summary_id,
    p_receipt_id, (select promotion_id from public.topic_promotions where topic_id = p_topic_id order by created_at limit 1), p_actor, t.current_version_id)
  returning version_id into v_id;
  insert into public.topic_version_evidence (version_id, ordinal, kind, ref, ref_hash, as_of, state, digest, section_key)
  select v_id, (e ->> 'ordinal')::int, e ->> 'kind', e -> 'ref', e ->> 'ref_hash', (e ->> 'as_of')::timestamptz, e ->> 'state', e ->> 'digest', e ->> 'section_key'
  from jsonb_array_elements(p_evidence) e;
  update public.topics set current_version_id = v_id, status = 'published' where topic_id = p_topic_id;
  perform public.topic_audit(p_topic_id, p_actor, 'publish', jsonb_build_object('version_no', v_no, 'evidence', jsonb_array_length(p_evidence), 'receipt_id', p_receipt_id));
  return jsonb_build_object('version_id', v_id, 'version_no', v_no);
end $$;

create or replace function public.topic_unpublish(p_topic_id uuid, p_reason text, p_note text, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.topics; v_prev public.topic_versions; v_no int;
begin
  if p_actor is null then raise exception 'invalid_actor'; end if;
  if p_note is not null and (length(p_note) > 200 or p_note ~* '[0-9a-f]{8}-[0-9a-f]{4}-' or p_note ~ '[0-9a-f]{64}') then raise exception 'invalid_note'; end if;
  select * into t from public.topics where topic_id = p_topic_id for update;
  if not found then raise exception 'not_found'; end if;
  if t.current_version_id is null then raise exception 'not_published'; end if;
  select version_no into v_no from public.topic_versions where version_id = t.current_version_id;
  update public.topic_versions set unpublished_at = now(), unpublish_reason = p_reason where version_id = t.current_version_id;
  select * into v_prev from public.topic_versions where topic_id = p_topic_id and unpublished_at is null order by version_no desc limit 1;
  if found then
    update public.topics set current_version_id = v_prev.version_id where topic_id = p_topic_id;
  elsif t.status = 'retired' then
    update public.topics set current_version_id = null where topic_id = p_topic_id;
  else
    update public.topics set current_version_id = null, status = 'unpublished' where topic_id = p_topic_id;
  end if;
  perform public.topic_audit(p_topic_id, p_actor, 'unpublish', jsonb_build_object('version_no', v_no, 'reason', p_reason, 'note', p_note));
  return jsonb_build_object('current_version_no', v_prev.version_no);
end $$;
```

End the file with one `do $$` loop that, for every function in `public` whose name starts with `topic_` and is not a trigger function, revokes execute from `public, anon, authenticated`, then grants `service_role` execute on every one except `topic_audit` (the broker file's loop at lines ~935–943 is the model).

- [ ] **Step 4: Run both DB gates**

Run: `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db`
Expected: `topics functions` all passed.
Run: `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:migrations`
Expected: `reports/migration-rehearsal.json` reports identical fresh and seeded schemas.

- [ ] **Step 5: Commit** (`supabase/migrations/20261210091000_topics_functions.sql`, the test file; message `feat(topics): security-definer write functions`).

### Task T1.3: flag, errors, shared types

**Files:**
- Create: `src/lib/topics/flags.ts`, `src/lib/topics/errors.ts`, `src/lib/topics/types.ts`, `src/lib/topics/database-types.ts`
- Test: `src/lib/topics/flags.test.ts`

- [ ] **Step 1: Failing test**

```ts
// src/lib/topics/flags.test.ts
import {describe,expect,it} from 'vitest';
import {TOPIC_STALE_DAYS,topicsEnabled} from './flags';
import {TopicError,TOPIC_ERROR_STATUS} from './errors';

describe('topics flag',()=>{
 it.each([[undefined,false],['',false],['0',false],['true',false],['1',true]] as const)('TOPICS_ENABLED=%s → %s',(v,on)=>{
  expect(topicsEnabled({TOPICS_ENABLED:v})).toBe(on);
 });
 it('uses the D9 default',()=>{expect(TOPIC_STALE_DAYS).toBe(90);});
});
describe('TopicError',()=>{
 it('maps every spec §13.1 code to its status',()=>{
  expect(TOPIC_ERROR_STATUS).toEqual({topics_disabled:404,not_found:404,no_version_at_asof:404,topic_retired:410,version_unpublished:410,
   invalid_parameter:400,slug_taken:409,revision_conflict:409,publish_blocked:409,resolver_degraded:409,licence_confirmation_missing:409,
   quota_exceeded:429,code_version_unavailable:503,unsupported_media_type:415,forbidden_origin:403,invalid_body:400});
 });
 it('keeps the detail after the colon and looks the status up by the head',()=>{
  const e=new TopicError('publish_blocked:dangling_slot,numeral_in_owner_text');
  expect([e.code,e.status]).toEqual(['publish_blocked:dangling_slot,numeral_in_owner_text',409]);
 });
});
```

- [ ] **Step 2: Run** `npm test -- src/lib/topics/flags.test.ts` · Expected: FAIL, `Cannot find module './flags'`.

- [ ] **Step 3: Implement**

```ts
// src/lib/topics/flags.ts
// Server switch (spec §9). Off → pages notFound(), APIs 404 topics_disabled, crons {skipped:'disabled'}.
export const topicsEnabled=(env:Record<string,string|undefined>=process.env):boolean=>env.TOPICS_ENABLED==='1';
/** D9: a current version older than this many days is marked stale. */
export const TOPIC_STALE_DAYS=90;
```

```ts
// src/lib/topics/errors.ts
export const TOPIC_ERROR_STATUS={topics_disabled:404,not_found:404,no_version_at_asof:404,topic_retired:410,version_unpublished:410,
 invalid_parameter:400,slug_taken:409,revision_conflict:409,publish_blocked:409,resolver_degraded:409,licence_confirmation_missing:409,
 quota_exceeded:429,code_version_unavailable:503,unsupported_media_type:415,forbidden_origin:403,invalid_body:400} as const;
export type TopicErrorHead=keyof typeof TOPIC_ERROR_STATUS;
export class TopicError extends Error{
 readonly status:number;
 constructor(readonly code:string,readonly detail:Record<string,unknown>|null=null){
  super(code);this.name='TopicError';
  this.status=TOPIC_ERROR_STATUS[code.split(':')[0] as TopicErrorHead]??500;
 }
}
```

`src/lib/topics/types.ts` (the names every later task uses; write exactly these):

```ts
import type {EvidenceRef,EvidenceKind} from '@/lib/evidence/ref';
import type {Resolved,ResolveState} from '@/lib/evidence/resolve';
export type Bilingual={zh:string;en:string};
export const CATEGORIES=['macro','industry','company','cross_market','method'] as const;
export type Category=typeof CATEGORIES[number];
export const UNPUBLISH_REASONS=['error','licence','owner_request','privacy'] as const;
export type UnpublishReason=typeof UNPUBLISH_REASONS[number];
export const SLOT_REASONS=['industry_not_published','hk_not_served','foreign_research_not_wired','cn_values_withheld','source_pending'] as const;
export type SlotReason=typeof SLOT_REASONS[number];
export type SectionItem={ordinal:number}|{expected_slot:string};
export interface DraftSection{key:string;title:Bilingual;note:Bilingual|null;items:SectionItem[]}
/** as_of may be left out in a draft; assemble() fills it with the cutoff (spec §5.1). */
export type DraftRef=Omit<EvidenceRef,'as_of'>&{as_of?:string};
/** ordinal is assigned once (max+1) and never renumbered, so {{ev:n}} slots survive removals. */
export interface DraftEvidence{ordinal:number;ref:DraftRef;section_key:string}
export interface ExpectedSlot{key:string;kind:EvidenceKind;label:Bilingual;reason_code:SlotReason}
export type DraftEntry=
 |{key:string;entry_type:'owner_note';body:Bilingual}
 |{key:string;entry_type:'licensed_excerpt';licence_id:string;fragments:{text:string;attribution:string;date:string;url:string}[]};
export interface DraftBody{title:Bilingual;dek:Bilingual;sections:DraftSection[];evidence:DraftEvidence[];expected_slots:ExpectedSlot[];
 entries:DraftEntry[];blocks_provenance:Record<string,'owner'|'from_thesis'|'reviewed'>}
export type EvidenceCounts=Record<ResolveState,number>;
export interface SnapshotEvidence{ordinal:number;ref:EvidenceRef;ref_hash:string;resolved:Resolved;section_key:string}
export interface RenderedSummary{facts:{fact_id:string;text:string;refs:number[]}[];points:{text:string;fact_ids:string[];refs:number[]}[];
 counterpoints:{text:string;fact_ids:string[];refs:number[]}[];incomparable:{a:number;b:number}[];prompt_version:string;validator_version:string;model:string;provider:string}
export interface TopicSnapshot{topic:{slug:string;category:Category;title:Bilingual;dek:Bilingual};sections:DraftSection[];evidence:SnapshotEvidence[];
 expected_slots:ExpectedSlot[];entries:DraftEntry[];summary:RenderedSummary|null;counts:EvidenceCounts;
 freshness_at_publication:Record<string,'fresh'|'stale'|'unknown'>;contract_version:'evidence-ref/1';resolver_versions:Record<string,string>}
export const DRIFTS=['unchanged','revised','newer_period','retracted','now_withheld','unverifiable'] as const;
export type Drift=typeof DRIFTS[number];
export interface DriftRow{version_id:string;ordinal:number;drift:Drift;current_identity:{value_text:string|null;unit:string|null;period:string|null;available_at:string|null}|null}
export interface EvidenceRowInput{ordinal:number;kind:EvidenceKind;ref:EvidenceRef;ref_hash:string;as_of:string;state:ResolveState;digest:string|null;section_key:string}
export interface DisclosureCheck{id:number;key:string;result:'pass'|'warn'|'block';codes:string[];detail:Record<string,unknown>}
```

`src/lib/topics/database-types.ts`: one exported interface per table of T1.1 with the column names verbatim (`TopicSettingsRow`, `TopicRow`, `TopicVersionRow`, `TopicVersionEvidenceRow`, `TopicDraftRow`, `TopicSourceLicenceRow`, `TopicPromotionRow`, `TopicSummaryRunRow`, `TopicSummaryRow`, `TopicDisclosureReceiptRow`, `TopicAuditRow`, `TopicEvidenceDriftRow`) and one per view (`PublicTopicRow`, `PublicVersionRow`, `PublicDriftRow`, `PublicLicenceStatusRow`). `timestamptz` and `date` are `string`, `jsonb` columns use the types above (`snapshot: TopicSnapshot | null` in `PublicVersionRow`). File header: "Topic table shapes are owned by this module so the shared Database stays byte-for-byte stable for methodology formula hashing."

This task compiles only after T2.2 and T2.3 exist on the branch's base. PR-1 and PR-2 are parallel, so in PR-1 `types.ts` imports are satisfied by two tiny files created here and replaced in PR-2 **only if PR-2 has not merged yet**: `src/lib/evidence/ref.ts` exporting `EvidenceKind`, `EvidenceRef` and `src/lib/evidence/resolve.ts` exporting `ResolveState`, `Resolved` exactly as written in T2.2/T2.3 (type declarations only). Whichever PR merges second rebases and keeps the PR-2 files.

- [ ] **Step 4: Run** `npm test -- src/lib/topics/flags.test.ts` · Expected: PASS (8 tests). `npm run typecheck` · Expected: no errors.
- [ ] **Step 5: Commit** (`feat(topics): flag, error codes and shared types`).

### Task T1.4: `TopicsDb` port, three adapters, contract suite

**Files:**
- Create: `src/lib/topics/db-contract.ts`, `src/lib/topics/memory-db.ts`, `src/lib/topics/pg-db.ts`, `src/lib/topics/db.ts`
- Modify: `src/lib/topics/types.ts` (add the port), `src/lib/topics/topics.integration.test.ts`
- Test: `src/lib/topics/db.test.ts`

Port (append to `types.ts`):

```ts
import type {PublicDriftRow,PublicTopicRow,PublicVersionRow,TopicAuditRow,TopicDisclosureReceiptRow,TopicDraftRow,TopicRow,TopicSettingsRow,TopicVersionEvidenceRow,TopicVersionRow} from './database-types';
export class TopicsDbError extends Error{constructor(readonly code:string){super(code);this.name='TopicsDbError';}}
export interface TopicsDb{
 // service role (admin routes, crons)
 createTopic(i:{slug:string;category:Category;body:DraftBody;actor:string}):Promise<{topic_id:string;revision:number;draft_hash:string}>;
 topicById(topicId:string):Promise<TopicRow|null>;
 adminTopics():Promise<(TopicRow&{title:Bilingual;draft_revision:number;current_version_no:number|null;revised_count:number;promoted:boolean})[]>;
 draftOf(topicId:string):Promise<TopicDraftRow|null>;
 saveDraft(i:{topicId:string;expectedRevision:number;body:DraftBody;actor:string}):Promise<{revision:number;draft_hash:string}>;
 recordDisclosure(i:{topicId:string;draftHash:string;checks:DisclosureCheck[];passed:boolean;codeVersion:string;actor:string}):Promise<string>;
 receiptById(receiptId:string):Promise<TopicDisclosureReceiptRow|null>;
 latestReceipt(topicId:string,draftHash:string):Promise<TopicDisclosureReceiptRow|null>;
 publish(i:{topicId:string;expectedDraftHash:string;snapshotText:string;evidence:EvidenceRowInput[];summaryId:string|null;receiptId:string;cutoff:string;actor:string}):Promise<{version_id:string;version_no:number}>;
 unpublish(i:{topicId:string;reason:UnpublishReason;note:string|null;actor:string}):Promise<{current_version_no:number|null}>;
 retire(i:{topicId:string;reason:UnpublishReason;note:string|null;actor:string}):Promise<void>;
 settings():Promise<TopicSettingsRow>;
 setPublicEnabled(i:{publicEnabled:boolean;summaryPublicEnabled:boolean;summaryProviderNote:string|null;licenceConfirmations:Record<string,{terms_url:string;confirmed_on:string}>;actor:string}):Promise<TopicSettingsRow>;
 versionsOfTopic(topicId:string):Promise<TopicVersionRow[]>;
 liveEvidence(after:{version_id:string;ordinal:number}|null,limit:number):Promise<TopicVersionEvidenceRow[]>;
 upsertDrift(rows:DriftRow[],checkedAt:string,complete:boolean,cursor:{version_id:string;ordinal:number}|null):Promise<number>;
 recordEvent(i:{topicId:string;actor:string;action:'preview'|'replay_verify';detail:Record<string,unknown>}):Promise<void>;
 driftOf(versionId:string):Promise<DriftRow[]>;
 auditOf(topicId:string):Promise<TopicAuditRow[]>;
 // session client (public views)
 publicOpen():Promise<boolean>;                    // true only when topic_settings.public_enabled
 publicTopics():Promise<PublicTopicRow[]>;
 publicTopicBySlug(slug:string):Promise<PublicTopicRow|null>;
 publicVersions(topicId:string):Promise<PublicVersionRow[]>;
 publicDrift(versionId:string):Promise<PublicDriftRow[]>;
}
```

`createTopic` and `saveDraft` compute `body_text = canonicalJson(body)` (from `@/lib/evidence/hash`) and pass it to the SQL function. `liveEvidence` returns evidence rows of versions with `unpublished_at is null`, ordered `(version_id, ordinal)`, strictly after the cursor. Adapters map a PostgreSQL error message to `TopicsDbError(code)` where code = the message up to the first space (the functions raise bare codes).

- [ ] **Step 1: Write the contract suite and the memory test**

```ts
// src/lib/topics/db-contract.ts
// One behaviour suite, run against memory (db.test.ts) and PostgreSQL (topics.integration.test.ts).
import {describe,expect,it} from 'vitest';
import {canonicalJson,sha256Hex} from '@/lib/evidence/hash';
import {TopicsDbError,type DraftBody,type EvidenceRowInput,type TopicsDb,type TopicSnapshot} from './types';

export interface TopicsContractHarness{db:TopicsDb;newId():string;setPublic(on:boolean):Promise<void>;asPublic():TopicsDb}
const body=(title:string):DraftBody=>({title:{zh:title,en:title},dek:{zh:'',en:''},sections:[],evidence:[],expected_slots:[],entries:[],blocks_provenance:{}});
export function fixtureVersion(h:TopicsContractHarness,slug:string,states:EvidenceRowInput['state'][]=['ok']):{snapshotText:string;evidence:EvidenceRowInput[]}{
 const evidence=states.map((state,i):EvidenceRowInput=>{
  const ref={v:1 as const,kind:'macro_observation' as const,id:h.newId(),as_of:'2026-11-01T00:00:00.000Z'};
  return {ordinal:i+1,kind:ref.kind,ref,ref_hash:sha256Hex(canonicalJson(ref)),as_of:ref.as_of,state,digest:state==='ok'?sha256Hex(`d${i}`):null,section_key:'s1'};
 });
 const counts={ok:0,missing:0,withheld:0,not_served:0,unsupported:0,retracted:0};for(const e of evidence)counts[e.state]++;
 const snapshot={topic:{slug,category:'macro',title:{zh:slug,en:slug},dek:{zh:'',en:''}},sections:[],expected_slots:[],entries:[],summary:null,counts,
  freshness_at_publication:{},contract_version:'evidence-ref/1',resolver_versions:{},
  evidence:evidence.map(e=>({ordinal:e.ordinal,ref:e.ref,ref_hash:e.ref_hash,section_key:e.section_key,resolved:{state:e.state,reason:e.state==='ok'?null:'fixture',ref:e.ref,basis:null,
   display:{label:{zh:'x',en:'x'},fact:e.state==='ok'?{template:'topic.macro_level',slots:{value:{value_text:'4.3',unit:'pct'}}}:null,period:'2026-08',available_at:null},
   drawer:null,digest:e.digest,freshness:null}}))} as unknown as TopicSnapshot;
 return {snapshotText:canonicalJson(snapshot),evidence};
}
export function topicsDbContract(label:string,setup:()=>Promise<TopicsContractHarness>):void{
 describe(`${label}: TopicsDb contract`,()=>{
  const actor='00000000-0000-4000-8000-0000000000aa';
  const make=async(h:TopicsContractHarness,slug:string,states?:EvidenceRowInput['state'][])=>{
   const t=await h.db.createTopic({slug,category:'macro',body:body(slug),actor});
   const receiptId=await h.db.recordDisclosure({topicId:t.topic_id,draftHash:t.draft_hash,checks:[],passed:true,codeVersion:'test',actor});
   const v=fixtureVersion(h,slug,states);
   const p=await h.db.publish({topicId:t.topic_id,expectedDraftHash:t.draft_hash,...v,summaryId:null,receiptId,cutoff:'2026-11-10T00:00:00.000Z',actor});
   return {...t,...p,...v};
  };
  it('creates a topic with draft revision 1 and the canonical draft hash',async()=>{
   const h=await setup();const t=await h.db.createTopic({slug:`${label}-c1`,category:'macro',body:body('a'),actor});
   expect(t.revision).toBe(1);expect(t.draft_hash).toBe(sha256Hex(canonicalJson(body('a'))));
  });
  it('rejects a reused slug with slug_taken',async()=>{
   const h=await setup();await h.db.createTopic({slug:`${label}-c2`,category:'macro',body:body('a'),actor});
   await expect(h.db.createTopic({slug:`${label}-c2`,category:'macro',body:body('b'),actor})).rejects.toEqual(new TopicsDbError('slug_taken'));
  });
  it('rejects a stale revision with revision_conflict',async()=>{
   const h=await setup();const t=await h.db.createTopic({slug:`${label}-c3`,category:'macro',body:body('a'),actor});
   await h.db.saveDraft({topicId:t.topic_id,expectedRevision:1,body:body('b'),actor});
   await expect(h.db.saveDraft({topicId:t.topic_id,expectedRevision:1,body:body('c'),actor})).rejects.toEqual(new TopicsDbError('revision_conflict'));
  });
  it('publishes, lists the evidence copy and returns the snapshot text unchanged',async()=>{
   const h=await setup();const p=await make(h,`${label}-c4`,['ok','withheld']);
   const [v]=await h.db.versionsOfTopic(p.topic_id);
   expect([v.version_no,v.snapshot_text,v.snapshot_hash]).toEqual([1,p.snapshotText,sha256Hex(p.snapshotText)]);
   expect((await h.db.liveEvidence(null,500)).filter(e=>e.version_id===p.version_id).map(e=>e.state)).toEqual(['ok','withheld']);
  });
  it('hides everything from the public client until the switch is on',async()=>{
   const h=await setup();const p=await make(h,`${label}-c5`);
   await h.setPublic(false);expect(await h.asPublic().publicTopicBySlug(`${label}-c5`)).toBeNull();
   await h.setPublic(true);
   const t=await h.asPublic().publicTopicBySlug(`${label}-c5`);
   expect(await h.asPublic().publicOpen()).toBe(true);
   expect([t?.version_no,t?.title_zh,t?.evidence_counts?.ok]).toEqual([1,`${label}-c5`,1]);
   expect((await h.asPublic().publicVersions(p.topic_id)).map(v=>v.version_no)).toEqual([1]);
   await h.setPublic(false);
  });
  it('unpublish nulls the public snapshot and keeps the reason',async()=>{
   const h=await setup();const p=await make(h,`${label}-c6`);
   expect(await h.db.unpublish({topicId:p.topic_id,reason:'privacy',note:null,actor})).toEqual({current_version_no:null});
   await h.setPublic(true);
   const [v]=await h.asPublic().publicVersions(p.topic_id);
   expect([v.snapshot,v.unpublish_reason]).toEqual([null,'privacy']);
   await h.setPublic(false);
  });
  it('upserts drift and stamps the completed check time',async()=>{
   const h=await setup();const p=await make(h,`${label}-c7`);
   await h.db.upsertDrift([{version_id:p.version_id,ordinal:1,drift:'revised',current_identity:{value_text:'4.2',unit:'pct',period:'2026-08',available_at:'2026-10-03T12:30:00.000Z'}}],'2026-11-12T06:30:00.000Z',true,null);
   expect((await h.db.driftOf(p.version_id))[0].drift).toBe('revised');
   expect((await h.db.settings()).drift_checked_at).toBe('2026-11-12T06:30:00.000Z');
  });
  it('writes one audit row per write, without content',async()=>{
   const h=await setup();const p=await make(h,`${label}-c8`);
   expect((await h.db.auditOf(p.topic_id)).map(a=>a.action)).toEqual(['create','disclosure_check','publish']);
  });
 });
}
```

```ts
// src/lib/topics/db.test.ts
import {randomUUID} from 'node:crypto';
import {topicsDbContract} from './db-contract';
import {memoryTopicsDb} from './memory-db';
topicsDbContract('memory',async()=>{const m=memoryTopicsDb();return {db:m,newId:randomUUID,setPublic:async on=>{m.setPublicFlag(on);},asPublic:()=>m};});
```

In `topics.integration.test.ts` add, inside a `describe.skipIf(!enabled)`:

```ts
topicsDbContract('pg',async()=>({db:pgTopicsDb(pool),newId:randomUUID,
 setPublic:async on=>{await pool.query('update public.topic_settings set public_enabled=$1 where id=1',[on]);},
 asPublic:()=>pgTopicsDb(pool,{role:'authenticated'})}));
```

`pgTopicsDb(pool, opts?: {role:'authenticated'})` runs each public read as `begin; set local role authenticated; …; rollback`. The contract's `setPublic` in the PG harness writes the row directly (test-only); production uses `setPublicEnabled`.

- [ ] **Step 2: Run** `npm test -- src/lib/topics/db.test.ts` · Expected: FAIL, `Cannot find module './memory-db'`.
- [ ] **Step 3: Implement** `memoryTopicsDb()` (emulates the function rules and error codes of T1.2, including every `publish_blocked:*` check and the append-only rules; extra test hooks `setPublicFlag(on)`, `now(d)`), `pgTopicsDb`, and `supabaseTopicsDb({admin?, session?})` (`admin.rpc('topic_*')` for writes, `admin.from(table)` for service reads, `session.from(view)` for the four `public*` methods; calling a method without its client throws `TopicsDbError('client_unavailable')`).
- [ ] **Step 4: Run** `npm test -- src/lib/topics/db.test.ts` · Expected: PASS (8). Then the PG gate · Expected: `pg: TopicsDb contract` 8 passed.
- [ ] **Step 5: Commit** (`feat(topics): storage port with memory, pg and supabase adapters`).

### Task T1.5: register the two message domains

**Files:**
- Modify: `src/i18n/request.ts`
- Create: `messages/zh/topics.json`, `messages/en/topics.json`, `messages/zh/topicsAdmin.json`, `messages/en/topicsAdmin.json`
- Test: `src/lib/topics/messages-parity.test.ts`

- [ ] **Step 1: Failing test**

```ts
// src/lib/topics/messages-parity.test.ts
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';
const load=(l:string,d:string)=>JSON.parse(readFileSync(resolve(process.cwd(),`messages/${l}/${d}.json`),'utf8')) as Record<string,unknown>;
const flat=(o:unknown,p=''):[string,string][]=>typeof o==='string'?[[p,o]]:Object.entries(o as Record<string,unknown>).flatMap(([k,v])=>flat(v,p?`${p}.${k}`:k));
const holes=(s:string)=>[...s.matchAll(/\{(\w+)[,}]/g)].map(m=>m[1]).sort();
const BANNED=/买入|卖出|推荐|增持|减持|目标价|建仓|抄底|\b(buy|sell|recommend|overweight|underweight|target price|accumulate)\b/i;
describe.each(['topics','topicsAdmin'])('%s messages',domain=>{
 const zh=new Map(flat(load('zh',domain))),en=new Map(flat(load('en',domain)));
 it('has identical keys, placeholders and no empty strings',()=>{
  expect([...zh.keys()].sort()).toEqual([...en.keys()].sort());
  for(const [k,v] of zh){expect(v.trim(),k).not.toBe('');expect(en.get(k)!.trim(),k).not.toBe('');expect(holes(v),k).toEqual(holes(en.get(k)!));}
 });
 it('contains no advice wording (spec §3, §13.2)',()=>{
  for(const [k,v] of [...zh,...en])if(!k.startsWith('lint.examples.'))expect(v,k).not.toMatch(BANNED);
 });
});
it('registers both domains inside the TOPICS fence after the FOREIGN fence',()=>{
 expect(readFileSync(resolve(process.cwd(),'src/i18n/request.ts'),'utf8')).toMatch(/\/\/ FOREIGN ↑\n\s*\/\/ TOPICS ↓[^\n]*\n\s*'topics', 'topicsAdmin',\n\s*\/\/ TOPICS ↑/);
});
```

This test file is the one other place allowed to spell the advice terms (it is listed in T2.9's scan allowlist).

- [ ] **Step 2: Run** `npm test -- src/lib/topics/messages-parity.test.ts` · Expected: FAIL, `ENOENT … messages/zh/topics.json`.
- [ ] **Step 3: Implement.** In `MESSAGE_DOMAINS`, directly after `// FOREIGN ↑`:

```ts
  // TOPICS ↓ topic research (spec 2026-11-16 §7): public pages / admin pages
  'topics', 'topicsAdmin',
  // TOPICS ↑
```

Seed files: `topics.json` = `{"meta":{"title":"专题研究","titleEn":"Topic research","scope":"由本站证据组装的版本化专题档案。"}}` (en: `"title":"Topic research","titleEn":"Topic research","scope":"Versioned topic dossiers assembled from this site's evidence."`); `topicsAdmin.json` = `{"meta":{"title":"专题管理"}}` (en `"Topic admin"`).

- [ ] **Step 4: Run** the test, plus `npm test -- src/components/research-ui/research-messages.test.ts src/app/\(app\)/intel/foreign-research/messages-parity.test.ts` · Expected: all PASS (the two existing fence assertions still hold).
- [ ] **Step 5: Commit** (`feat(topics): register topics and topicsAdmin message domains`).

**PR-1 gate before opening:** `npm run build`; both PG commands; `npm test`. PR body states: no lock change (X2), module closed, owner step O1.

---

## PR-2: evidence contract and resolvers (branch `claude/topics-pr2-evidence`)

### Task T2.1: move the hash helpers

**Files:**
- Create: `src/lib/evidence/hash.ts`, `src/lib/evidence/hash.test.ts`
- Modify: `src/lib/macro/strategy/hash.ts` (becomes a re-export)

- [ ] **Step 1: Failing test**

```ts
// src/lib/evidence/hash.test.ts
import {describe,expect,it} from 'vitest';
import * as evidence from './hash';
import * as macro from '@/lib/macro/strategy/hash';
describe('evidence hash',()=>{
 it('is the same function object the macro module exports',()=>{
  expect(macro.canonicalJson).toBe(evidence.canonicalJson);expect(macro.sha256Hex).toBe(evidence.sha256Hex);
 });
 it('sorts keys, drops undefined and keeps array order',()=>{
  expect(evidence.canonicalJson({b:1,a:[2,{d:undefined,c:'x'}]})).toBe('{"a":[2,{"c":"x"}],"b":1}');
 });
 it('hashes UTF-8 text',()=>{expect(evidence.sha256Hex('专题')).toBe('395f735c3a5da93487c71d74101ebde1dcaf186562c0a59e50df5a4106b99103');});
});
```

- [ ] **Step 2: Run** `npm test -- src/lib/evidence/hash.test.ts` · Expected: FAIL, `Cannot find module './hash'`.
- [ ] **Step 3: Implement.** Move the body of `src/lib/macro/strategy/hash.ts` byte for byte into `src/lib/evidence/hash.ts` (keep its header comment, add "moved from macro/strategy/hash.ts, topic spec §4.1"). The old file becomes:

```ts
// Canonical JSON and sha256 now live in src/lib/evidence/hash.ts (topic spec 2026-11-16 §4.1); re-exported so macro imports are unchanged.
export {canonicalJson,sha256Hex} from '@/lib/evidence/hash';
```

- [ ] **Step 4: Run** `npm test -- src/lib/evidence/hash.test.ts src/lib/macro/strategy` · Expected: PASS, including the existing `hash.test.ts` and `forbidden-terms.test.ts` with no assertion changed.
- [ ] **Step 5: Commit** (`refactor(evidence): move canonical hash helpers, macro re-exports`).

### Task T2.2: `EvidenceRef`

**Files:** Create `src/lib/evidence/ref.ts`, `src/lib/evidence/ref.test.ts`

- [ ] **Step 1: Failing test**

```ts
// src/lib/evidence/ref.test.ts
import {describe,expect,it} from 'vitest';
import {EVIDENCE_KINDS as UI_KINDS} from '@/components/research-ui/source-drawer/types';
import {CONTRACT_VERSION,EVIDENCE_KINDS,EvidenceRefError,asOfFromDate,canonicalRef,parseRef,refHash} from './ref';
const ID='7b0f6c1e-5d0a-4f43-9a55-1d3f0c2b9a10';
describe('evidence-ref/1',()=>{
 it('names the contract and exactly the six kinds the drawer knows',()=>{
  expect(CONTRACT_VERSION).toBe('evidence-ref/1');expect([...EVIDENCE_KINDS]).toEqual([...UI_KINDS]);
 });
 it('normalises as_of to millisecond Z and drops the locator from identity',()=>{
  const ref=parseRef({v:1,kind:'macro_observation',id:ID,as_of:'2026-11-14T08:00:00+08:00',locator:{series_id:'US_UNRATE',period_end:'2026-08-31'}});
  expect(ref.as_of).toBe('2026-11-14T00:00:00.000Z');
  expect(canonicalRef(ref)).toEqual({v:1,kind:'macro_observation',id:ID,as_of:'2026-11-14T00:00:00.000Z'});
  expect(refHash(ref)).toBe(refHash({...ref,locator:{series_id:'OTHER',period_end:'2020-01-31'}}));
  expect(refHash(ref)).toMatch(/^[0-9a-f]{64}$/);
 });
 it('reads a date as the end of that UTC day',()=>{expect(asOfFromDate('2026-11-14')).toBe('2026-11-14T23:59:59.999Z');});
 it.each([
  [{v:2,kind:'macro_observation',id:ID,as_of:'2026-11-14T00:00:00Z'},'invalid_ref:v'],
  [{v:1,kind:'podcast',id:ID,as_of:'2026-11-14T00:00:00Z'},'invalid_ref:kind'],
  [{v:1,kind:'financial_fact',id:'not-a-uuid',as_of:'2026-11-14T00:00:00Z'},'invalid_ref:id'],
  [{v:1,kind:'industry_metric',id:`${ID}:7372:net_margin:2025-01-01`,as_of:'2026-11-14T00:00:00Z'},'invalid_ref:id'],
  [{v:1,kind:'judgment',id:ID,as_of:'yesterday'},'invalid_ref:as_of'],
  [{v:1,kind:'judgment',id:ID,as_of:'2026-11-14T00:00:00Z',locator:{a:1}},'invalid_ref:locator'],
  [{v:1,kind:'judgment',id:ID,as_of:'2026-11-14T00:00:00Z',extra:true},'invalid_ref:extra'],
 ])('rejects %j with %s',(raw,code)=>{expect(()=>parseRef(raw)).toThrow(new EvidenceRefError(code));});
 it('accepts the composite industry id',()=>{
  expect(parseRef({v:1,kind:'industry_metric',id:`${ID}:7372:net_margin:2025-01-01:2025-12-31`,as_of:'2026-11-14T00:00:00Z'}).kind).toBe('industry_metric');
 });
});
```

- [ ] **Step 2: Run** · Expected: FAIL, `Cannot find module './ref'`.
- [ ] **Step 3: Implement**

```ts
// src/lib/evidence/ref.ts
// evidence-ref/1 (topic spec 2026-11-16 §4.1). A new kind is a new contract version, never an edit here.
import {canonicalJson,sha256Hex} from './hash';
export const CONTRACT_VERSION='evidence-ref/1';
export const EVIDENCE_KINDS=['macro_observation','industry_metric','financial_fact','document_citation','broker_report_meta','judgment'] as const;
export type EvidenceKind=typeof EVIDENCE_KINDS[number];
export interface EvidenceRef{v:1;kind:EvidenceKind;id:string;as_of:string;locator?:Record<string,string>}
export class EvidenceRefError extends Error{constructor(readonly code:string){super(code);this.name='EvidenceRefError';}}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const INDUSTRY_ID=/^([0-9a-f-]{36}):([A-Za-z0-9.]{1,16}):([a-z_]{1,40}):(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/;
const ALLOWED=new Set(['v','kind','id','as_of','locator']);
export const asOfFromDate=(d:string):string=>{if(!DATE.test(d))throw new EvidenceRefError('invalid_ref:as_of');return `${d}T23:59:59.999Z`;};
export function parseIndustryId(id:string):{run_id:string;code:string;metric:string;period_start:string;period_end:string}|null{
 const m=INDUSTRY_ID.exec(id);return m&&UUID.test(m[1])?{run_id:m[1],code:m[2],metric:m[3],period_start:m[4],period_end:m[5]}:null;
}
export function parseRef(raw:unknown):EvidenceRef{
 const bad=(f:string)=>new EvidenceRefError(`invalid_ref:${f}`);
 if(raw===null||typeof raw!=='object'||Array.isArray(raw))throw bad('shape');
 const r=raw as Record<string,unknown>;
 for(const k of Object.keys(r))if(!ALLOWED.has(k))throw bad(k);
 if(r.v!==1)throw bad('v');
 if(typeof r.kind!=='string'||!(EVIDENCE_KINDS as readonly string[]).includes(r.kind))throw bad('kind');
 const kind=r.kind as EvidenceKind;
 if(typeof r.id!=='string'||!(kind==='industry_metric'?parseIndustryId(r.id):UUID.test(r.id)))throw bad('id');
 const t=typeof r.as_of==='string'?Date.parse(r.as_of):NaN;
 if(!Number.isFinite(t)||!/^\d{4}-\d{2}-\d{2}T/.test(r.as_of as string))throw bad('as_of');
 let locator:Record<string,string>|undefined;
 if(r.locator!==undefined){
  if(r.locator===null||typeof r.locator!=='object'||Array.isArray(r.locator)||Object.values(r.locator).some(v=>typeof v!=='string'))throw bad('locator');
  locator=r.locator as Record<string,string>;
 }
 return {v:1,kind,id:r.id,as_of:new Date(t).toISOString(),...(locator?{locator}:{})};
}
export const canonicalRef=(ref:EvidenceRef):{v:1;kind:EvidenceKind;id:string;as_of:string}=>({v:1,kind:ref.kind,id:ref.id,as_of:new Date(ref.as_of).toISOString()});
export const refHash=(ref:EvidenceRef):string=>sha256Hex(canonicalJson(canonicalRef(ref)));
```

- [ ] **Step 4: Run** `npm test -- src/lib/evidence/ref.test.ts` · Expected: PASS (12).
- [ ] **Step 5: Commit** (`feat(evidence): evidence-ref/1 shape, canonical form and hash`).

### Task T2.3: resolver contract, registry, drawer payload, sources port

**Files:**
- Create: `src/lib/evidence/resolve.ts`, `src/lib/evidence/drawer.ts`, `src/lib/evidence/sources.ts`, `src/lib/evidence/memory-sources.ts`, `src/lib/evidence/resolve.test.ts`

Types (write exactly; later tasks depend on the names):

```ts
// src/lib/evidence/resolve.ts
import type {EvidenceKind,EvidenceRef} from './ref';
import type {SourceDrawerPayload} from './drawer';
export const RESOLVE_STATES=['ok','missing','withheld','not_served','unsupported','retracted'] as const;
export type ResolveState=typeof RESOLVE_STATES[number];
export interface ResolveCtx{audience:'public'|'admin';now:Date;locale:'zh'|'en'}
export type Slot={value_text:string;unit:string}|string;
export interface Resolved{
 state:ResolveState;reason:string|null;ref:EvidenceRef;basis:'point_in_time'|'reconstruction'|null;
 display:{label:{zh:string;en:string};fact:{template:string;slots:Record<string,Slot>}|null;period:string|null;available_at:string|null};
 drawer:SourceDrawerPayload|{kind:EvidenceKind;identity:{id:string;label:string};reason:string}|null;
 digest:string|null;
 freshness:{dataset:string;status:'fresh'|'stale'|'unknown';checked_at:string}|null;
 admin_only?:true;
}
/** What the source holds now for the same identity (drift check, spec §5.4). `value` is public-safe or null. */
export interface LatestIdentity{state:'ok'|'retracted'|'withheld'|'missing';object_id:string|null;
 value:{value_text:string;unit:string;period:string;available_at:string}|null;newer_period:string|null;reason:string|null}
export interface EvidenceResolver<K extends EvidenceKind=EvidenceKind>{
 kind:K;code_version:string;
 resolve(refs:EvidenceRef[],ctx:ResolveCtx):Promise<Resolved[]>;
 latestIdentity(ref:EvidenceRef):Promise<LatestIdentity|null>;
}
export interface ResolveReceipt{errors:{index:number;kind:EvidenceKind;message:string}[]}
export interface Resolver{
 resolve(refs:EvidenceRef[],ctx:ResolveCtx):Promise<{resolved:Resolved[];receipt:ResolveReceipt}>;
 latestIdentity(ref:EvidenceRef):Promise<LatestIdentity|null>;
 versions():Record<string,string>;
}
export function createResolver(registry:readonly EvidenceResolver[]):Resolver;
export function missing(ref:EvidenceRef,reason:string,label?:{zh:string;en:string}):Resolved;
export function digestOf(fact:NonNullable<Resolved['display']['fact']>,identity:{id:string;label:string}):string;
```

`src/lib/evidence/drawer.ts` declares `SourceDrawerPayload` with the same fields as `src/components/research-ui/source-drawer/types.ts` (copy the interface; `kind: EvidenceKind` from `./ref`).

`src/lib/evidence/sources.ts`:

```ts
import type {ObservationRow} from '@/lib/macro/types';
import type {FactRow} from '@/lib/facts/types';
import type {Envelope,MethodologyRow} from '@/lib/judgments/types';
export type Bi={zh:string;en:string};
export interface MacroSeriesInfo{id:string;name:Bi;unit:string;status:'active'|'missing'|'restricted';rights:'public_domain'|'official_open'|'third_party';
 publisher:Bi;relay:string|null;adapter:string;dataset:'macro.fred'|'macro.akshare'}
export interface MacroRetrieval{retrieval_id:string;fetch_url:string|null;fetched_at:string;sha256:string|null}
export interface MacroSource{
 rows(ids:readonly string[]):Promise<ObservationRow[]>;                      // any status
 versions(seriesId:string,periodEnd:string):Promise<ObservationRow[]>;       // any status, version ascending
 latestPeriodEnd(seriesId:string):Promise<string|null>;                      // status ok
 series(seriesId:string):MacroSeriesInfo|null;
 retrievals(ids:readonly string[]):Promise<Map<string,MacroRetrieval>>;
}
export interface IndustryCellKey{run_id:string;code:string;metric:string;period_start:string;period_end:string}
export interface IndustryCell{
 run:{run_id:string;scheme:'sw2021'|'sic';version:string;level:number;generation:number;status:'building'|'active'|'superseded'|'failed';
  history_class:'point_in_time'|'reconstruction';activated_at:string|null;method_version:string;code_version:string};
 row:{status:'ok'|'missing';missing_reason:string|null;value_text:string|null;unit:string;duration:string;n_members:number;n_with_data:number}|null;
 label:Bi;
}
export interface IndustrySource{
 cell(key:IndustryCellKey):Promise<IndustryCell|null>;                       // null = unknown run
 datasetPublic(scheme:'sw2021'|'sic',version:string):Promise<boolean>;
 activeCell(scheme:'sw2021'|'sic',version:string,level:number,key:Omit<IndustryCellKey,'run_id'>):Promise<{run_id:string;value_text:string|null;unit:string;activated_at:string}|null>;
 latestPeriodEnd(scheme:'sw2021'|'sic',version:string,level:number,code:string,metric:string):Promise<string|null>;
}
export type FactEligibility={ok:true}|{ok:false;reason:'evidence_incomplete'|'citation_pending'};
export interface FactInfo{row:FactRow;issuer:{name:Bi;ticker:string|null};filing:{form_type:string|null;source_ref:string|null;url:string|null}|null;publisher:string}
export interface FactSource{
 facts(ids:readonly string[]):Promise<FactInfo[]>;                           // any status, any market
 eligibility(rows:readonly FactRow[],opts:{admin:boolean}):Promise<Map<string,FactEligibility>>;
 current(row:FactRow):Promise<FactRow|null>;                                 // current disclosure of the same (issuer, concept, period, duration, consolidation, unit)
 newerPeriodEnd(row:FactRow):Promise<string|null>;
}
export interface CitationInfo{citation_id:string;document_id:string;page_no:number;snippet:string;text_hash:string;visibility:'internal'|'public';created_at:string;
 document:{title:string;permission:'public'|'licensed'|'private';publisher:string;url:string|null}}
export interface DocumentSource{citation(id:string):Promise<CitationInfo|null>}
export interface JudgmentSource{judgment(id:string):Promise<{envelope:Envelope;method:MethodologyRow|null}|null>}
export interface EvidenceSources{
 macro:MacroSource;industry:IndustrySource;facts:FactSource;documents:DocumentSource;judgments:JudgmentSource;
 freshness(dataset:string,now:Date):Promise<{dataset:string;status:'fresh'|'stale'|'unknown';checked_at:string}>;
}
```

`memorySources(seed)` in `memory-sources.ts` builds an `EvidenceSources` from plain arrays (`{macro:{rows,series,retrievals}, industry:{cells,publicDatasets}, facts:{infos,ineligible:Map<fact_id,reason>}, documents:{citations}, judgments:{items}, freshness:Record<dataset,status>}`) and exposes `seed` for mutation between calls (used to inject a revision).

- [ ] **Step 1: Failing test**

```ts
// src/lib/evidence/resolve.test.ts
import {describe,expect,it} from 'vitest';
import type {SourceDrawerPayload as UiPayload} from '@/components/research-ui/source-drawer/types';
import type {SourceDrawerPayload} from './drawer';
import {createResolver,digestOf,missing,type EvidenceResolver,type Resolved} from './resolve';
import type {EvidenceRef} from './ref';
const ref=(kind:EvidenceRef['kind'],n:number):EvidenceRef=>({v:1,kind,id:`00000000-0000-4000-8000-00000000000${n}`,as_of:'2026-11-14T00:00:00.000Z'});
const ctx={audience:'public' as const,now:new Date('2026-11-15T00:00:00Z'),locale:'zh' as const};
const ok=(r:EvidenceRef):Resolved=>({...missing(r,'x'),state:'ok',reason:null});
const fake=(kind:EvidenceRef['kind'],impl:(refs:EvidenceRef[])=>Promise<Resolved[]>):EvidenceResolver=>({kind,code_version:`${kind}/1`,resolve:impl,latestIdentity:async()=>null});
describe('createResolver',()=>{
 it('dispatches by kind and returns results in input order with equal length (rule 1)',async()=>{
  const r=createResolver([fake('macro_observation',async refs=>refs.map(ok)),fake('judgment',async refs=>refs.map(ok))]);
  const input=[ref('judgment',1),ref('macro_observation',2),ref('judgment',3)];
  const out=await r.resolve(input,ctx);
  expect(out.resolved.map(x=>x.ref)).toEqual(input);expect(out.receipt.errors).toEqual([]);
 });
 it('turns a throwing resolver into missing:resolver_error for its refs only and records it',async()=>{
  const r=createResolver([fake('macro_observation',async()=>{throw new Error('boom');}),fake('judgment',async refs=>refs.map(ok))]);
  const out=await r.resolve([ref('macro_observation',1),ref('judgment',2)],ctx);
  expect(out.resolved.map(x=>[x.state,x.reason])).toEqual([['missing','resolver_error'],['ok',null]]);
  expect(out.receipt.errors).toEqual([{index:0,kind:'macro_observation',message:'boom'}]);
 });
 it('treats a wrong-length answer as a resolver error',async()=>{
  const r=createResolver([fake('judgment',async()=>[])]);
  expect((await r.resolve([ref('judgment',1)],ctx)).resolved[0].reason).toBe('resolver_error');
 });
 it('returns unsupported for a kind with no resolver (rule 4)',async()=>{
  const out=await createResolver([]).resolve([ref('broker_report_meta',1)],ctx);
  expect([out.resolved[0].state,out.resolved[0].reason]).toEqual(['unsupported','no_resolver']);
 });
 it('exposes resolver code versions',()=>{
  expect(createResolver([fake('judgment',async r=>r.map(ok))]).versions()).toEqual({judgment:'judgment/1'});
 });
});
describe('digestOf',()=>{
 it('is stable under key order and changes with the value',()=>{
  const id={id:'a',label:'b'};
  const a=digestOf({template:'t',slots:{value:{value_text:'4.3',unit:'pct'},period:'2026-08'}},id);
  expect(a).toBe(digestOf({slots:{period:'2026-08',value:{unit:'pct',value_text:'4.3'}},template:'t'},id));
  expect(a).not.toBe(digestOf({template:'t',slots:{value:{value_text:'4.2',unit:'pct'},period:'2026-08'}},id));
 });
});
it('keeps the lib payload type identical to the drawer component type',()=>{
 const a:UiPayload={} as SourceDrawerPayload;const b:SourceDrawerPayload={} as UiPayload;expect([a,b].length).toBe(2);
});
```

- [ ] **Step 2: Run** `npm test -- src/lib/evidence/resolve.test.ts` · Expected: FAIL, `Cannot find module './resolve'`.
- [ ] **Step 3: Implement.** `createResolver` groups indexes by kind, calls each resolver once inside `try/catch`, validates `length === refs.length`, and fills failures with `missing(ref,'resolver_error')`. `missing(ref,reason,label={zh:'',en:''})` returns `{state:'missing',reason,ref,basis:null,display:{label,fact:null,period:null,available_at:null},drawer:null,digest:null,freshness:null}`. `digestOf(fact,identity)=sha256Hex(canonicalJson({fact,identity}))`. `latestIdentity` dispatches by kind and returns `null` when there is no resolver.
- [ ] **Step 4: Run** · Expected: PASS (7). `npm run typecheck` clean (the assignability test is a compile-time check).
- [ ] **Step 5: Commit** (`feat(evidence): resolver contract, registry and sources port`).

### Task T2.4: macro observation resolver

**Files:** Create `src/lib/evidence/resolvers/macro.ts`, `src/lib/evidence/resolvers/macro.test.ts`, `src/lib/evidence/fixtures/macro.ts`

State rules (spec §4.1 table with X5):

| Condition, checked in this order | Result |
|---|---|
| no row for the id | `missing:not_found` |
| `locator` present and `series_id` / `period_end` differ from the row | `missing:locator_mismatch` |
| series unknown or `status==='missing'` | `missing:catalog_missing` |
| row `status` is `quarantined` or `rejected` | `retracted:<status>` |
| `available_at > as_of` | `missing:not_yet_available` |
| series `status==='restricted'` (public audience) | `withheld:catalog_restricted` |
| series `rights==='third_party'` (public audience) | `withheld:licence_unconfirmed` |
| otherwise | `ok`, `fact={template:'topic.macro_level',slots:{series:<id>,period:<period_end>,value:{value_text,unit}}}` |

Admin audience: the two withheld rows resolve `ok` with `admin_only:true`. Drawer payload follows `macroDrawerInput` field for field: `identity {id: observation_id, label: "<series_id> · <name[locale]>"}`, `source {publisher, adapter, url: retrieval.fetch_url, locator: JSON of row.locator, evidence_sha256: retrieval.sha256}`, `times {period, available_at, ingested_at}`, `transform {code_version: row.code_version, mapping_version: null, method_version: null}`, `licence {status: rights, note_key: "macro:rights:<rights>"}`, `attribution_key: 'macro:attribution'`, `links {module_href: "/macro/<series_id>"}`. `freshness` = `sources.freshness(series.dataset, ctx.now)`. `latestIdentity`: the highest `status='ok'` version of `(series_id, period_end)`; `retracted` when the frozen row is no longer `ok`; `withheld` when the series is now restricted or third-party; `newer_period` = `latestPeriodEnd` when greater than the row's.

- [ ] **Step 1: Failing test**

```ts
// src/lib/evidence/resolvers/macro.test.ts
import {describe,expect,it} from 'vitest';
import {memorySources} from '../memory-sources';
import {macroFixture,OBS} from '../fixtures/macro';
import {macroResolver} from './macro';
import type {EvidenceRef} from '../ref';
const ref=(id:string,as_of='2026-11-14T00:00:00.000Z',locator?:Record<string,string>):EvidenceRef=>({v:1,kind:'macro_observation',id,as_of,...(locator?{locator}:{})});
const pub={audience:'public' as const,now:new Date('2026-11-15T00:00:00Z'),locale:'zh' as const};
describe('macro_observation resolver',()=>{
 const r=()=>macroResolver(memorySources(macroFixture()));
 it.each([
  ['an ok row',ref(OBS.unrateV1),'ok',null],
  ['an unknown id',ref('00000000-0000-4000-8000-0000000000ff'),'missing','not_found'],
  ['a locator that names another series',ref(OBS.unrateV1,undefined,{series_id:'US_CPI',period_end:'2026-08-31'}),'missing','locator_mismatch'],
  ['a series absent from the catalog',ref(OBS.orphan),'missing','catalog_missing'],
  ['a quarantined row',ref(OBS.quarantined),'retracted','quarantined'],
  ['an as_of before availability',ref(OBS.unrateV1,'2026-09-01T00:00:00.000Z'),'missing','not_yet_available'],
  ['a restricted series',ref(OBS.vix),'withheld','catalog_restricted'],
  ['a third-party series',ref(OBS.thirdParty),'withheld','licence_unconfirmed'],
 ] as const)('%s → %s:%s',async(_n,input,state,reason)=>{
  const [out]=await r().resolve([input],pub);
  expect([out.state,out.reason]).toEqual([state,reason]);
  if(state!=='ok'){expect(out.display.fact).toBeNull();expect(out.digest).toBeNull();}
 });
 it('renders the frozen value, drawer and freshness for an ok row',async()=>{
  const [out]=await r().resolve([ref(OBS.unrateV1)],pub);
  expect(out.display.fact).toEqual({template:'topic.macro_level',slots:{series:'US_UNRATE',period:'2026-08-31',value:{value_text:'4.3',unit:'pct'}}});
  expect(out.drawer).toMatchObject({kind:'macro_observation',identity:{id:OBS.unrateV1},attribution_key:'macro:attribution',links:{module_href:'/macro/US_UNRATE'}});
  expect(out.freshness).toEqual({dataset:'macro.fred',status:'fresh',checked_at:'2026-11-15T00:00:00.000Z'});
  expect(out.digest).toMatch(/^[0-9a-f]{64}$/);
 });
 it('never puts a withheld value anywhere in the public result (rule 3)',async()=>{
  const [out]=await r().resolve([ref(OBS.vix)],pub);
  expect(JSON.stringify(out)).not.toContain('18.75');
  expect(out.drawer).toEqual({kind:'macro_observation',identity:{id:OBS.vix,label:expect.stringContaining('US_VIX')},reason:'catalog_restricted'});
 });
 it('lets an admin see the value, marked admin_only',async()=>{
  const [out]=await r().resolve([ref(OBS.vix)],{...pub,audience:'admin'});
  expect([out.state,out.admin_only]).toEqual(['ok',true]);
 });
 it('is not moved by a later revision of the same period (rule 2) and reports it as the latest identity',async()=>{
  const src=memorySources(macroFixture());const res=macroResolver(src);
  const before=(await res.resolve([ref(OBS.unrateV1)],pub))[0].digest;
  src.seed.macro.rows.push({...src.seed.macro.rows.find(x=>x.observation_id===OBS.unrateV1)!,observation_id:OBS.unrateV2,version:2,value_text:'4.2',available_at:'2026-10-03T12:30:00.000Z'});
  expect((await res.resolve([ref(OBS.unrateV1)],pub))[0].digest).toBe(before);
  expect(await res.latestIdentity(ref(OBS.unrateV1))).toMatchObject({state:'ok',object_id:OBS.unrateV2,value:{value_text:'4.2',unit:'pct'}});
 });
 it('gives the same digest twice (rule 7)',async()=>{
  const a=await r().resolve([ref(OBS.unrateV1)],pub),b=await r().resolve([ref(OBS.unrateV1)],pub);
  expect(a[0].digest).toBe(b[0].digest);
 });
});
```

`fixtures/macro.ts` exports `OBS` (six fixed UUIDs: `unrateV1`, `unrateV2`, `vix`, `thirdParty`, `quarantined`, `orphan`) and `macroFixture()` returning the seed: `US_UNRATE` (active, `public_domain`, `macro.fred`, unit `pct`) with `unrateV1` = `2026-08-31`, `4.3`, version 1, `available_at 2026-09-05T12:30:00.000Z`, `status ok`; `US_VIX` (restricted, `third_party`) with `vix` = `18.75`; `US_TP_ACTIVE` (active, `third_party`) with `thirdParty`; `quarantined` on `US_UNRATE` period `2026-07-31` with `status quarantined`; `orphan` on series `US_GONE` not in `series`; one retrieval per row; `freshness: {'macro.fred':'fresh'}`.

- [ ] **Step 2: Run** `npm test -- src/lib/evidence/resolvers/macro.test.ts` · Expected: FAIL, `Cannot find module './macro'`.
- [ ] **Step 3: Implement** `export function macroResolver(sources:EvidenceSources):EvidenceResolver<'macro_observation'>` with `code_version:'evidence-macro/1'`, one `sources.macro.rows(ids)` and one `retrievals` call per batch.
- [ ] **Step 4: Run** · Expected: PASS (13).
- [ ] **Step 5: Commit** (`feat(evidence): macro observation resolver`).

### Task T2.5: industry metric resolver

**Files:** Create `src/lib/evidence/resolvers/industry.ts`, `…/industry.test.ts`, `src/lib/evidence/fixtures/industry.ts`

| Condition, in order | Result |
|---|---|
| `sources.industry.cell(key)` is null | `missing:not_found` |
| run `status` is `building` or `failed`, or `activated_at` is null or `> as_of` | `missing:run_not_active` |
| dataset not public (public audience) | `withheld:unlicensed` |
| no row for the key | `missing:not_found` |
| row `status==='missing'` | `missing:<missing_reason>` |
| otherwise | `ok`, `basis = run.history_class`, `fact={template:'topic.industry_value',slots:{industry:<code>,metric,period:<period_end>,value:{value_text,unit},n_with_data:String(n),n_members:String(n)}}` |

Drawer: `identity {id, label}`, `source {publisher:'OsbornAlpha industry aggregates', adapter:"<scheme> · gen <generation>", url:null, locator:"<code> · <metric> · <period_end>", evidence_sha256:null}`, `times {period: period_end, available_at: activated_at, ingested_at:null}`, `transform {code_version, mapping_version:null, method_version}`, `licence {status:'public', note_key:"industry:dataset:<scheme>"}`, `attribution_key:"industry:<scheme>"`, `links {module_href:"/intel/industries/<code>?scheme=<scheme>"}`. Freshness dataset `industry.agg.<scheme>`. `latestIdentity`: `activeCell` of the same `(scheme, version, level, code, metric, period)`; a different `run_id` with a different `value_text` is a revision; unknown run (deleted, spec Q1) → return `null` (drift `unverifiable`).

- [ ] **Step 1: Failing test** (same shape as T2.4; cases and expected `[state, reason, basis]`):

```ts
it.each([
 ['an ok cell of the active reconstruction run',CELL.sicOk,'ok',null,'reconstruction'],
 ['an ok cell of a superseded point-in-time run activated before as_of',CELL.swSuperseded,'ok',null,'point_in_time'],
 ['an unknown run',CELL.unknownRun,'missing','not_found',null],
 ['a run still building',CELL.building,'missing','run_not_active',null],
 ['a run activated after as_of',CELL.activatedLater,'missing','run_not_active',null],
 ['a dataset that is not public',CELL.swInternal,'withheld','unlicensed',null],
 ['a cell absent from the run',CELL.noRow,'missing','not_found',null],
 ['a missing cell',CELL.zeroDenominator,'missing','zero_denominator',null],
] as const)('%s → %s:%s',async(_n,id,state,reason,basis)=>{
 const [out]=await industryResolver(memorySources(industryFixture())).resolve([{v:1,kind:'industry_metric',id,as_of:'2026-11-14T00:00:00.000Z'}],pub);
 expect([out.state,out.reason,out.basis]).toEqual([state,reason,basis]);
});
it('carries the member counts as slots and never a value when withheld',async()=>{
 const res=industryResolver(memorySources(industryFixture()));
 const [okCell]=await res.resolve([{v:1,kind:'industry_metric',id:CELL.sicOk,as_of:'2026-11-14T00:00:00.000Z'}],pub);
 expect(okCell.display.fact?.slots).toMatchObject({value:{value_text:'0.201',unit:'ratio'},n_with_data:'41',n_members:'52'});
 const [held]=await res.resolve([{v:1,kind:'industry_metric',id:CELL.swInternal,as_of:'2026-11-14T00:00:00.000Z'}],pub);
 expect(JSON.stringify(held)).not.toContain('0.333');
});
it('returns null as latest identity when the run was deleted',async()=>{
 const src=memorySources(industryFixture());src.seed.industry.cells=src.seed.industry.cells.filter(c=>c.key.run_id!==RUN.sic);
 expect(await industryResolver(src).latestIdentity({v:1,kind:'industry_metric',id:CELL.sicOk,as_of:'2026-11-14T00:00:00.000Z'})).toBeNull();
});
```

`fixtures/industry.ts` exports `RUN` (five run UUIDs), `CELL` (the eight composite ids above built as `` `${run}:${code}:${metric}:${start}:${end}` ``) and `industryFixture()`; the SIC run is `active`, `reconstruction`, `activated_at 2026-11-10T00:00:00.000Z`, dataset public; the `sw2021` runs are not public except `swSuperseded`'s dataset flag set public for that case only by using version `2021-pub`.

- [ ] **Step 2: Run** · Expected: FAIL, `Cannot find module './industry'`.
- [ ] **Step 3: Implement** `industryResolver(sources)` with `code_version:'evidence-industry/1'`.
- [ ] **Step 4: Run** · Expected: PASS (10).
- [ ] **Step 5: Commit** (`feat(evidence): industry metric resolver`).

### Task T2.6: financial fact resolver

**Files:** Create `src/lib/evidence/resolvers/fact.ts`, `…/fact.test.ts`, `src/lib/evidence/fixtures/facts.ts`

| Condition, in order | Result |
|---|---|
| no row | `missing:not_found` |
| `row.market==='HK'` | `not_served:hk_not_served` |
| `row.status==='quarantined'` | `retracted:quarantined` |
| `row.status==='staged'` | `missing:not_found` |
| `available_date > as_of` (date compare on the UTC date of `as_of`) | `missing:not_yet_available` |
| eligibility `{ok:false, reason}` (public audience) | `withheld:<reason>` |
| otherwise | `ok`, `fact={template:'topic.fact_value',slots:{company:<name[locale]>,concept,period:<period_end>,duration,value:{value_text,unit}}}` |

Admin audience calls `eligibility(rows,{admin:true})` (CN `citation_pending` is waived there by the gate itself); a row still ineligible for admins stays withheld; a row that is eligible only for admins gets `admin_only:true`. Drawer: `source {publisher: info.publisher, adapter: filing.form_type, url: filing.url, locator: "<concept> · <source_concept>", evidence_sha256: null}`, `transform {code_version:null, mapping_version: row.mapping_version, method_version:null}`, `attribution_key: row.market==='US' ? 'facts:sec' : 'facts:cninfo'`, `links {module_href: ticker ? "/stock/<ticker>" : "/intel/companies"}`. Freshness dataset `facts.us` / `facts.cn`. `latestIdentity`: `current(row)`; different `fact_id` with different `value_text` → revised value (only when that row is itself publicly eligible, else `value:null`); frozen row quarantined → `retracted`; frozen row no longer eligible → `withheld`; `newer_period` from `newerPeriodEnd`.

- [ ] **Step 1: Failing test**

```ts
it.each([
 ['a US fact with complete evidence',FACT.usOk,'ok',null],
 ['an unknown id',FACT.unknown,'missing','not_found'],
 ['a Hong Kong fact',FACT.hk,'not_served','hk_not_served'],
 ['a quarantined fact',FACT.quarantined,'retracted','quarantined'],
 ['a staged fact',FACT.staged,'missing','not_found'],
 ['a fact not yet available at as_of',FACT.usLater,'missing','not_yet_available'],
 ['a CN fact whose citation is pending',FACT.cnPending,'withheld','citation_pending'],
 ['a US fact with incomplete evidence',FACT.usIncomplete,'withheld','evidence_incomplete'],
] as const)('%s → %s:%s',async(_n,id,state,reason)=>{
 const [out]=await factResolver(memorySources(factFixture())).resolve([{v:1,kind:'financial_fact',id,as_of:'2026-11-14T00:00:00.000Z'}],pub);
 expect([out.state,out.reason]).toEqual([state,reason]);
});
it('A6: the CN value appears nowhere in the serialised public result',async()=>{
 const out=await factResolver(memorySources(factFixture())).resolve([{v:1,kind:'financial_fact',id:FACT.cnPending,as_of:'2026-11-14T00:00:00.000Z'}],pub);
 expect(JSON.stringify(out)).not.toContain('987654321.12');
});
it('shows the CN value to an admin only with the admin_only mark',async()=>{
 const [out]=await factResolver(memorySources(factFixture())).resolve([{v:1,kind:'financial_fact',id:FACT.cnPending,as_of:'2026-11-14T00:00:00.000Z'}],{...pub,audience:'admin'});
 expect([out.state,out.admin_only,(out.display.fact?.slots.value as {value_text:string}).value_text]).toEqual(['ok',true,'987654321.12']);
});
it('reports a restated value as the latest identity',async()=>{
 expect(await factResolver(memorySources(factFixture())).latestIdentity({v:1,kind:'financial_fact',id:FACT.usOk,as_of:'2026-11-14T00:00:00.000Z'}))
  .toMatchObject({state:'ok',object_id:FACT.usRestated,value:{value_text:'1010'}});
});
```

`fixtures/facts.ts`: `FACT` ids and `factFixture()`; `usOk` (`us-gaap:Revenues`, FY2025, `1000`, `USD`, `available_date 2026-02-01`), `usRestated` (same identity, `1010`, `available_date 2026-11-20`, returned by `current(usOk)`), `cnPending` (`market 'CN'`, value `987654321.12`), `ineligible` map `{cnPending:'citation_pending', usIncomplete:'evidence_incomplete'}`; in memory, `eligibility(rows,{admin:true})` drops `citation_pending`.

- [ ] **Step 2: Run** · Expected: FAIL, `Cannot find module './fact'`.
- [ ] **Step 3: Implement** `factResolver(sources)` with `code_version:'evidence-fact/1'`.
- [ ] **Step 4: Run** · Expected: PASS (11).
- [ ] **Step 5: Commit** (`feat(evidence): financial fact resolver behind the company evidence gate`).

### Task T2.7: citation, judgment and broker resolvers; production sources; contract test

**Files:**
- Create: `src/lib/evidence/resolvers/citation.ts`, `…/judgment.ts`, `…/broker.ts`, `src/lib/evidence/fixtures/{documents,judgments}.ts`, `src/lib/evidence/production-sources.ts`, `src/lib/evidence/index.ts`, `src/lib/evidence/contract.test.ts`, `src/lib/evidence/production-sources.test.ts`

Rules:

| Kind | Condition, in order | Result |
|---|---|---|
| `document_citation` | not found | `missing:not_found` |
| | `created_at > as_of` | `missing:not_yet_available` |
| | `visibility!=='public'` or `document.permission!=='public'` | `withheld:private_document` (both audiences: a private document never enters a topic) |
| | otherwise | `ok`, `fact={template:'topic.citation',slots:{title:<document.title>,page:String(page_no)}}`; the snippet goes only into `drawer.source.locator` as `"p.<n> · <snippet>"` |
| `judgment` | not found | `missing:not_found` |
| | `judgment.registered_at > as_of` | `missing:not_yet_registered` |
| | `method` null or `!method.publishable` | `withheld:method_not_publishable` |
| | `lifecycleOf(envelope)==='withdrawn'` | `retracted:withdrawn` |
| | otherwise | `ok`, `fact={template:'topic.judgment_ref',slots:{method:"<methodology_id>@<version>"}}`, `drawer.links.module_href="/intel/methods/<id>/<version>"`, `attribution_key:'judgments:method'` |
| `broker_report_meta` | always | `unsupported:foreign_research_not_wired` (X6); `latestIdentity` → `null` |

`production-sources.ts`: `export function productionSources(clients:{admin:SupabaseClient}):EvidenceSources`, service role throughout:
- `macro.rows` / `versions`: `supabaseTableClient(admin).select('macro_observations', …)` (no status filter); `series` maps `seriesById(id)` to `MacroSeriesInfo` (`dataset` from `datasetOf(def.region)` in `src/lib/macro/freshness.ts`); `retrievals` via `supabaseMacroDb({admin, anon: admin}).retrievalsByIds`.
- `industry`: `supabaseIndustryDb(admin)`; `cell` = `metricRun(run_id)` then `metricRowsOfRun(run_id,{codes:[code],metrics:[metric],periodEnds:[period_end]})` filtered on `period_start`; `datasetPublic` = `isDatasetPublic(schemeDatasetKey(scheme,version))`; `activeCell` = `activeMetricRun` + the same row read.
- `facts`: rows from `financial_facts` by `fact_id` through the table client; `eligibility` groups rows by `(issuer_id, market)` and calls `gateFacts` from `src/lib/company/evidence-gate.ts` once per group with `GateDeps` built as in `src/lib/company/deps.ts::productionReadDeps`; HK rows are never passed to the gate.
- `documents.citation`: `supabaseDocumentsDb(admin)`'s `citationById` + `documentById`.
- `judgments.judgment`: `JudgmentsDb.envelopeById(id,{view:'public'})` + the methodology row.
- `freshness`: `freshnessOf(tableClient, now)` filtered to the dataset; no row → `unknown`.

`index.ts` exports `productionResolver()` = `createResolver([macroResolver(s),industryResolver(s),factResolver(s),citationResolver(s),judgmentResolver(s),brokerResolver()])` and `memoryResolver(seed)`.

- [ ] **Step 1: Failing contract test** (spec §4.1 rules 1–7 run against every registered resolver)

```ts
// src/lib/evidence/contract.test.ts
import {describe,expect,it,vi} from 'vitest';
import {memorySources} from './memory-sources';
import {allFixtures,SAMPLES} from './fixtures';
import {EVIDENCE_KINDS} from './ref';
import {macroResolver} from './resolvers/macro';import {industryResolver} from './resolvers/industry';import {factResolver} from './resolvers/fact';
import {citationResolver} from './resolvers/citation';import {judgmentResolver} from './resolvers/judgment';import {brokerResolver} from './resolvers/broker';
const pub={audience:'public' as const,now:new Date('2026-11-15T00:00:00Z'),locale:'zh' as const};
const build=()=>{const s=memorySources(allFixtures());return {s,list:[macroResolver(s),industryResolver(s),factResolver(s),citationResolver(s),judgmentResolver(s),brokerResolver()]};};
it('registers one resolver per kind of the contract',()=>{expect(build().list.map(r=>r.kind).sort()).toEqual([...EVIDENCE_KINDS].sort());});
describe.each(build().list.map(r=>[r.kind] as const))('%s resolver contract',kind=>{
 const refs=SAMPLES[kind];   // per kind: every state the kind can produce, in a fixed order
 const get=()=>{const b=build();return {s:b.s,r:b.list.find(x=>x.kind===kind)!};};
 it('rule 1: same length, same order',async()=>{expect((await get().r.resolve(refs.map(x=>x.ref),pub)).map(x=>x.ref)).toEqual(refs.map(x=>x.ref));});
 it('produces exactly the states of the spec table',async()=>{
  expect((await get().r.resolve(refs.map(x=>x.ref),pub)).map(x=>`${x.state}:${x.reason}`)).toEqual(refs.map(x=>x.expect));
 });
 it('rule 3: fact, digest and payload are null unless ok; restricted values never serialise',async()=>{
  for(const [i,x] of (await get().r.resolve(refs.map(y=>y.ref),pub)).entries()){
   expect(x.digest===null,`digest ${i}`).toBe(x.state!=='ok');expect(x.display.fact===null,`fact ${i}`).toBe(x.state!=='ok');
   expect(x.admin_only).toBeUndefined();
   for(const secret of refs[i].secrets??[])expect(JSON.stringify(x)).not.toContain(secret);
  }
 });
 it('rule 6: resolving writes nothing',async()=>{
  const {s,r}=get();const before=JSON.stringify(s.seed);await r.resolve(refs.map(x=>x.ref),pub);await r.resolve(refs.map(x=>x.ref),{...pub,audience:'admin'});
  expect(JSON.stringify(s.seed)).toBe(before);
 });
 it('rule 7: digests repeat',async()=>{
  const {r}=get();const a=await r.resolve(refs.map(x=>x.ref),pub),b=await r.resolve(refs.map(x=>x.ref),pub);
  expect(a.map(x=>x.digest)).toEqual(b.map(x=>x.digest));
 });
});
it('A8: a broker ref is unsupported',async()=>{
 const [out]=await brokerResolver().resolve([SAMPLES.broker_report_meta[0].ref],pub);
 expect([out.state,out.reason]).toEqual(['unsupported','foreign_research_not_wired']);
});
it('rule 5: no resolver module imports another resolver',async()=>{
 const {readFileSync,readdirSync}=await vi.importActual<typeof import('node:fs')>('node:fs');
 for(const f of readdirSync('src/lib/evidence/resolvers').filter(n=>!n.endsWith('.test.ts')))
  expect(readFileSync(`src/lib/evidence/resolvers/${f}`,'utf8'),f).not.toMatch(/from '\.\/(macro|industry|fact|citation|judgment|broker)'/);
});
```

`fixtures/index.ts` exports `allFixtures()` (merge of the per-kind fixtures) and `SAMPLES: Record<EvidenceKind, {ref: EvidenceRef; expect: string; secrets?: string[]}[]>` listing, per kind, one ref for every row of that kind's rule table with `expect` as `"<state>:<reason>"` (`"ok:null"` for ok) and `secrets` = the raw `value_text` / snippet strings of withheld and retracted fixtures.

`production-sources.test.ts`: with a stub `TableClient`, assert (a) `macro.rows` selects `macro_observations` with no `status` key in the match, (b) `facts.eligibility` calls the gate once per `(issuer_id, market)` group and never with an HK row, (c) `freshness` returns `unknown` when `dq_freshness` has no row for the dataset.

- [ ] **Step 2: Run** `npm test -- src/lib/evidence` · Expected: FAIL, `Cannot find module './resolvers/citation'`.
- [ ] **Step 3: Implement** the three resolvers (`code_version` `evidence-citation/1`, `evidence-judgment/1`, `evidence-broker/0`), the fixtures, `production-sources.ts`, `index.ts`.
- [ ] **Step 4: Run** `npm test -- src/lib/evidence` · Expected: all PASS. `npm test -- src/lib/judgments/methodologies/macro-regime.v2.test.ts` · Expected: PASS (formula hash unchanged: no closure file was edited).
- [ ] **Step 5: Commit** (`feat(evidence): citation, judgment and broker resolvers, production sources, contract suite`).

### Task T2.8: evidence slots

**Files:** Create `src/lib/topics/slots.ts`, `src/lib/topics/slots.test.ts`

- [ ] **Step 1: Failing test**

```ts
// src/lib/topics/slots.test.ts
import {describe,expect,it} from 'vitest';
import {parseSlots,renderSlots,SLOT_RE} from './slots';
describe('evidence slots (spec §4.5, change list: syntax is {{ev:n}})',()=>{
 it('finds value and period slots with their positions',()=>{
  expect(parseSlots('截至 {{ev:1.period}}，利率为 {{ev:1}}。见 {{ev:14}}。')).toEqual([
   {ordinal:1,part:'period',start:3,end:18,raw:'{{ev:1.period}}'},{ordinal:1,part:'value',start:23,end:31,raw:'{{ev:1}}'},{ordinal:14,part:'value',start:34,end:43,raw:'{{ev:14}}'}]);
 });
 it.each(['{{ev:0}}','{{ev:01}}','{{ ev:1 }}','{{ev:1.value}}','{{ev:1.Period}}','{​{ev:1}​}'])('does not treat %s as a slot',s=>{
  expect(parseSlots(s)).toEqual([]);expect(SLOT_RE.test(s)).toBe(false);
 });
 it('renders slots into parts, leaving text untouched',()=>{
  const parts=renderSlots('A {{ev:2}} B',n=>n===2?{state:'ok',text:'4.3%',period:'2026-08'}:null);
  expect(parts).toEqual([{type:'text',text:'A '},{type:'slot',ordinal:2,part:'value',state:'ok',text:'4.3%'},{type:'text',text:' B'}]);
 });
 it('renders a non-ok slot as its state, never a number, and a dangling slot as dangling',()=>{
  expect(renderSlots('{{ev:5}}',()=>({state:'withheld',text:null,period:'2026Q3'}))).toEqual([{type:'slot',ordinal:5,part:'value',state:'withheld',text:null}]);
  expect(renderSlots('{{ev:9}}',()=>null)).toEqual([{type:'slot',ordinal:9,part:'value',state:'dangling',text:null}]);
 });
 it('strips slots for lexical checking',async()=>{
  const {withoutSlots}=await import('./slots');expect(withoutSlots('为 {{ev:1}}，截至 {{ev:1.period}}')).toBe('为 ，截至 ');
 });
});
```

- [ ] **Step 2: Run** · Expected: FAIL, `Cannot find module './slots'`.
- [ ] **Step 3: Implement**

```ts
// src/lib/topics/slots.ts
// Owner text carries numbers only as slots (spec §4.5, D4): {{ev:<ordinal>}} or {{ev:<ordinal>.period}}.
import type {ResolveState} from '@/lib/evidence/resolve';
export const SLOT_RE=/\{\{ev:([1-9]\d{0,3})(\.period)?\}\}/;
const GLOBAL=new RegExp(SLOT_RE.source,'g');
export interface SlotToken{ordinal:number;part:'value'|'period';start:number;end:number;raw:string}
export function parseSlots(text:string):SlotToken[]{
 return [...text.matchAll(GLOBAL)].map(m=>({ordinal:Number(m[1]),part:m[2]?'period':'value',start:m.index!,end:m.index!+m[0].length,raw:m[0]}));
}
export const withoutSlots=(text:string):string=>text.replace(GLOBAL,'');
export type SlotLookup=(ordinal:number)=>{state:ResolveState;text:string|null;period:string|null}|null;
export type SlotPart={type:'text';text:string}|{type:'slot';ordinal:number;part:'value'|'period';state:ResolveState|'dangling';text:string|null};
export function renderSlots(text:string,lookup:SlotLookup):SlotPart[]{
 const out:SlotPart[]=[];let at=0;
 for(const t of parseSlots(text)){
  if(t.start>at)out.push({type:'text',text:text.slice(at,t.start)});
  const e=lookup(t.ordinal);
  out.push(e===null?{type:'slot',ordinal:t.ordinal,part:t.part,state:'dangling',text:null}
   :{type:'slot',ordinal:t.ordinal,part:t.part,state:e.state,text:e.state!=='ok'?null:t.part==='period'?e.period:e.text});
  at=t.end;
 }
 if(at<text.length)out.push({type:'text',text:text.slice(at)});
 return out;
}
```

- [ ] **Step 4: Run** · Expected: PASS (11).
- [ ] **Step 5: Commit** (`feat(topics): evidence slot parser and renderer`).

### Task T2.9: owner-text lexical check and the vocabulary scan

**Files:** Create `src/lib/topics/lexical.ts`, `src/lib/topics/lexical.test.ts`, `src/lib/topics/vocabulary-scan.test.ts`

- [ ] **Step 1: Failing tests**

```ts
// src/lib/topics/lexical.test.ts
import {describe,expect,it} from 'vitest';
import {ADVICE_TERMS,adviceMatches,ownerTextFailures} from './lexical';
describe('owner text lexical rules (spec §4.5, §6.6 check 5)',()=>{
 it('lists the spec advice terms',()=>{
  expect([...ADVICE_TERMS]).toEqual(['买入','卖出','推荐','增持','减持','目标价','建仓','抄底','建议','buy','sell','recommend','overweight','underweight','target price','accumulate']);
 });
 it.each([['失业率为 4.3%','numeral_in_owner_text','4.3%'],['过去三个月','numeral_in_owner_text','三个月'],['我们建议关注银行息差','advice_term','建议'],
  ['逢低买入','advice_term','买入'],['We recommend banks','advice_term','recommend'],['胜率很高','forbidden_term','胜率']] as const)('%s → %s',(text,code,match)=>{
  expect(ownerTextFailures(text)).toContainEqual({code,match});
 });
 it('accepts clean text and ignores slots',()=>{
  expect(ownerTextFailures('截至 {{ev:1.period}}，联邦基金有效利率为 {{ev:1}}。')).toEqual([]);
 });
 it('matches English terms on word boundaries only',()=>{
  expect(adviceMatches('The seller buyback programme')).toEqual([]);expect(adviceMatches('Buy now')).toEqual(['buy']);
 });
 it('does not apply the regime-word rule to owner text',()=>{expect(ownerTextFailures('经济复苏阶段的行业表现')).toEqual([]);});
});
```

```ts
// src/lib/topics/vocabulary-scan.test.ts
// Advice wording is spelled only in the validator and its tests (spec §8.2, §13.2 "静态扫描").
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {expect,it} from 'vitest';
const ALLOW=new Set(['src/lib/topics/lexical.ts','src/lib/topics/lexical.test.ts','src/lib/topics/vocabulary-scan.test.ts','src/lib/topics/messages-parity.test.ts']);
const ROOTS=['src/lib/topics','src/lib/evidence','src/components/topics','src/app/(app)/intel/topics','src/app/(app)/admin/topics','src/app/api/topics','src/app/api/admin/topics'];
const walk=(d:string):string[]=>{try{return readdirSync(d).flatMap(n=>{const p=join(d,n);return statSync(p).isDirectory()?walk(p):[p];});}catch{return [];}};
const BANNED=/买入|卖出|推荐|增持|减持|目标价|建仓|抄底|\b(buy|sell|recommend|overweight|underweight|target price|accumulate)\b/i;
it('no topic source file spells an advice term outside the validator',()=>{
 const hits=ROOTS.flatMap(walk).filter(f=>/\.(ts|tsx|md)$/.test(f)&&!ALLOW.has(f)&&!f.includes('/fixtures/')).filter(f=>BANNED.test(readFileSync(f,'utf8')));
 expect(hits).toEqual([]);
});
```

("建议" is in `ADVICE_TERMS` because the `TopicEditor` artboard flags "建议关注" as `advice_term`; it is not in the scan's `BANNED` pattern because UI copy legitimately says "不构成投资建议".)

- [ ] **Step 2: Run** · Expected: FAIL, `Cannot find module './lexical'`.
- [ ] **Step 3: Implement**

```ts
// src/lib/topics/lexical.ts
// The only file (with its test) that spells advice terms. Owner text passes the macro numeral and
// forbidden-term checks unchanged, plus this list; it is not subject to the regime-word rule.
import {lexicalFailures} from '@/lib/macro/strategy/explain-validate';
import {withoutSlots} from './slots';
export const ADVICE_TERMS:readonly string[]=['买入','卖出','推荐','增持','减持','目标价','建仓','抄底','建议','buy','sell','recommend','overweight','underweight','target price','accumulate'];
const isAscii=(s:string)=>/^[\x20-\x7e]+$/.test(s);
export function adviceMatches(text:string):string[]{
 const t=text.normalize('NFKC');
 return ADVICE_TERMS.filter(term=>isAscii(term)?new RegExp(`\\b${term.replace(/ /g,'\\s+')}\\b`,'i').test(t):t.includes(term));
}
export type OwnerTextFailure={code:'numeral_in_owner_text'|'forbidden_term'|'advice_term';match:string};
export function ownerTextFailures(text:string):OwnerTextFailure[]{
 const bare=withoutSlots(text);
 const base=lexicalFailures(bare).filter(f=>f.code!=='regime_term').map(f=>({code:f.code==='numeral'?'numeral_in_owner_text' as const:'forbidden_term' as const,match:f.match}));
 return [...base,...adviceMatches(bare).map(match=>({code:'advice_term' as const,match}))];
}
```

- [ ] **Step 4: Run** `npm test -- src/lib/topics/lexical.test.ts src/lib/topics/vocabulary-scan.test.ts` · Expected: PASS. If "三个月" is not caught by `NUMERAL_PATTERNS`, the macro validator test already covers it (spec exit criterion): do not add patterns here, report it.
- [ ] **Step 5: Commit** (`feat(topics): owner-text lexical rules and vocabulary scan`).

**PR-2 gate:** `npm test -- src/lib/evidence src/lib/topics src/lib/macro/strategy src/lib/judgments/methodologies`; `npm run build`; PG gate (no DB change, but `verifyCriticalSuiteInventory` runs).

---

## PR-3: public read API and directory (branch `claude/topics-pr3-read`, after PR-1 and PR-2)

### Task T3.1: public DTOs and dependency wiring

**Files:** Create `src/lib/topics/public-dto.ts`, `src/lib/topics/deps.ts`, `src/lib/topics/public-route.ts`, `src/lib/topics/public-route.test.ts`

`public-dto.ts` (client-safe; imports types only):

```ts
import type {EvidenceKind} from '@/lib/evidence/ref';
import type {Resolved,ResolveState} from '@/lib/evidence/resolve';
import type {Bilingual,Category,DraftEntry,DraftSection,Drift,EvidenceCounts,ExpectedSlot,RenderedSummary,UnpublishReason} from './types';
export interface DirectoryItem{slug:string;category:Category;title:Bilingual;dek:Bilingual;version_no:number;published_at:string;
 evidence_counts:EvidenceCounts;drift_counts:Record<Exclude<Drift,'unchanged'>,number>;stale:boolean}
export interface PublicEvidence{ordinal:number;section_key:string;kind:EvidenceKind;state:ResolveState;reason:string|null;basis:Resolved['basis'];
 label:Bilingual;fact:Resolved['display']['fact'];period:string|null;available_at:string|null;
 drift:Exclude<Drift,'unchanged'>|null;masked:boolean;current:{value_text:string;unit:string;period:string;available_at:string}|null}
export interface VersionMeta{version_no:number;published_at:string;cutoff:string;is_current:boolean;superseded:boolean;unpublished_at:string|null;unpublish_reason:UnpublishReason|null}
export interface DossierDto{topic:{slug:string;category:Category;title:Bilingual;dek:Bilingual};
 version:VersionMeta;total_versions:number;current_version_no:number|null;view:'current'|'version'|'replay';replay_as_of:string|null;
 sections:DraftSection[];evidence:PublicEvidence[];expected_slots:ExpectedSlot[];entries:DraftEntry[];
 summary:(RenderedSummary&{hidden_points:number})|null;counts:EvidenceCounts;freshness_at_publication:Record<string,'fresh'|'stale'|'unknown'>;
 stale:boolean;age_days:number;drift_checked_at:string|null;drift_unchecked:boolean}
export interface EvidenceDetailDto{evidence:PublicEvidence;drawer:Resolved['drawer'];version_no:number}
```

`deps.ts`:

```ts
export interface PublicDeps{db:Pick<TopicsDb,'publicOpen'|'publicTopics'|'publicTopicBySlug'|'publicVersions'|'publicDrift'>;now():Date;preview:boolean}
export async function publicDeps():Promise<PublicDeps>   // fixtureMode() → fixture deps; else supabaseTopicsDb({session: await getServerSupabase()}), preview false
export function previewDeps():PublicDeps                  // service role; the four public* reads run against the base tables, ignoring the switch; preview true
export interface AdminDeps{db:TopicsDb;resolver:Resolver;now():Date;codeVersion:string|null;privateIds(userId:string):Promise<ReadonlySet<string>>}
export function adminDeps():AdminDeps                     // supabaseTopicsDb({admin:getAdminSupabase()}), productionResolver(), resolveCodeVersion({allowGit:false}); privateIds returns an empty set until T10.2
```

`previewDeps` (`publicOpen` always true) builds the four rows from `adminTopics()` / `versionsOfTopic()` / `driftOf()` with the same column names as the views (published, unpublished and retired topics only).

`public-route.ts`: `export function topicRoute<C>(tag:string, fn:(a:{request:Request;ctx:C;userId:string})=>Promise<Response>)`: `requireSessionUser()` (401) → `topicsEnabled()` else `errorResponse('topics_disabled','not found',404)` → `fn` → `TopicError` to `errorResponse(e.code, e.code, e.status)` (with `e.detail` merged into the body under `meta` when present), `QueryError` via `paramErrorResponse`, anything else `failureResponse(e, tag, 'topics unavailable')`. Success helper `jsonNoStore(body, status=200)` sets `Cache-Control: private, no-store`.

- [ ] **Step 1: Failing test** (`public-route.test.ts`): mock `@/lib/macro/route-helpers` `requireSessionUser`; assert (a) no session → 401 and `fn` not called, (b) `TOPICS_ENABLED` unset → 404 body `{error:{code:'topics_disabled',…}}`, (c) `fn` throwing `new TopicError('version_unpublished',{version_no:2,reason:'privacy'})` → 410 with `error.code==='version_unpublished'` and `meta` equal to the detail, (d) every response carries `Cache-Control` containing `no-store`.
- [ ] **Step 2: Run** `npm test -- src/lib/topics/public-route.test.ts` · Expected: FAIL, module not found.
- [ ] **Step 3: Implement** the three files.
- [ ] **Step 4: Run** · Expected: PASS (4).
- [ ] **Step 5: Commit** (`feat(topics): public DTOs, deps and route wrapper`).

### Task T3.2: read service

**Files:** Create `src/lib/topics/public-read.ts`, `src/lib/topics/public-read.test.ts`, `src/lib/topics/fixtures/published.ts`

```ts
export async function listTopics(d:PublicDeps,q:{category?:Category;q?:string;cursor?:string;limit:number}):Promise<{items:DirectoryItem[];nextCursor:string|null}>;
export async function readTopic(d:PublicDeps,slug:string,o:{asOf?:string;version?:number}):Promise<DossierDto>;
export async function readVersions(d:PublicDeps,slug:string):Promise<VersionMeta[]>;
export async function readEvidence(d:PublicDeps,slug:string,ordinal:number,version?:number):Promise<EvidenceDetailDto>;
```

Rules: every function first checks `d.preview || await d.db.publicOpen()`, else `TopicError('not_found')` (A2: switch off → 404; switch on and nothing published → an empty list, which the page shows as the empty state). `listTopics` keeps rows with `status==='published'` and a non-null `version_no`, filters `category`, filters `q` as a case-insensitive prefix of `title_zh` or `title_en` (`q` longer than 32 → `invalid_parameter:q`), sorts `published_at desc, topic_slug asc`, cursor = base64url of `published_at|slug`, `limit` 1–200 (default 50 at the route). `readTopic`: no row → `not_found`; `status==='retired'` → `topic_retired` with detail `{reason}`; `o.version` → that version (unpublished → `version_unpublished` with `{version_no, reason}`); `o.asOf` → T3.3; neither → the current version, and a topic whose `status==='unpublished'` → `version_unpublished` for its latest version. Evidence, summary and drift go through `maskSnapshot` (T3.3). `fixtures/published.ts` exports `publishedFixture()`: a `memoryTopicsDb` holding topic `rates-and-banks` with v1 (2026-11-01), v2 (2026-11-08, later unpublished in some tests) and topic `cn-company` (9 withheld of 12), built through `createTopic` → `recordDisclosure` → `publish` with snapshots produced by `fixtureVersion`-style helpers, and the memory clock set per publish.

- [ ] **Step 1: Failing test**

```ts
// src/lib/topics/public-read.test.ts
import {describe,expect,it} from 'vitest';
import {TopicError} from './errors';
import {publishedFixture} from './fixtures/published';
import {listTopics,readEvidence,readTopic,readVersions} from './public-read';
const deps=(f:ReturnType<typeof publishedFixture>,now='2026-11-15T00:00:00Z')=>({db:f.db,now:()=>new Date(now),preview:false});
describe('public read',()=>{
 it('A2: lists nothing while the switch is off',async()=>{
  const f=publishedFixture();f.db.setPublicFlag(false);
  await expect(listTopics(deps(f),{limit:50})).rejects.toEqual(new TopicError('not_found'));
  await expect(readTopic(deps(f),'rates-and-banks',{})).rejects.toEqual(new TopicError('not_found'));
 });
 it('lists published topics newest first with counts',async()=>{
  const f=publishedFixture();
  const {items,nextCursor}=await listTopics(deps(f),{limit:50});
  expect(items.map(i=>[i.slug,i.version_no])).toEqual([['rates-and-banks',2],['cn-company',1]]);
  expect(items[1].evidence_counts).toMatchObject({ok:3,withheld:9});expect(nextCursor).toBeNull();
 });
 it('filters by category and title prefix, and pages by cursor',async()=>{
  const f=publishedFixture();
  expect((await listTopics(deps(f),{limit:50,category:'company'})).items.map(i=>i.slug)).toEqual(['cn-company']);
  expect((await listTopics(deps(f),{limit:50,q:'利率'})).items.map(i=>i.slug)).toEqual(['rates-and-banks']);
  const p1=await listTopics(deps(f),{limit:1});expect(p1.nextCursor).not.toBeNull();
  expect((await listTopics(deps(f),{limit:1,cursor:p1.nextCursor!})).items.map(i=>i.slug)).toEqual(['cn-company']);
 });
 it('A3: returns every evidence item of the snapshot with a state',async()=>{
  const f=publishedFixture();const d=await readTopic(deps(f),'rates-and-banks',{});
  expect(d.evidence.length).toBe(f.snapshots['rates-and-banks'][2].evidence.length);
  expect(d.evidence.every(e=>e.state.length>0)).toBe(true);expect([d.view,d.version.version_no,d.total_versions]).toEqual(['current',2,2]);
 });
 it('reads a named version and marks it superseded',async()=>{
  const d=await readTopic(deps(publishedFixture()),'rates-and-banks',{version:1});
  expect([d.view,d.version.superseded,d.current_version_no]).toEqual(['version',true,2]);
 });
 it('D12: an unpublished version answers 410 with metadata only',async()=>{
  const f=publishedFixture();await f.unpublishCurrent('rates-and-banks','privacy');
  await expect(readTopic(deps(f),'rates-and-banks',{version:2})).rejects.toMatchObject({code:'version_unpublished',status:410,detail:{version_no:2,reason:'privacy'}});
  expect((await readTopic(deps(f),'rates-and-banks',{})).version.version_no).toBe(1);
  expect((await readVersions(deps(f),'rates-and-banks')).map(v=>[v.version_no,v.unpublish_reason])).toEqual([[2,'privacy'],[1,null]]);
 });
 it('a retired slug answers 410 topic_retired with the category only',async()=>{
  const f=publishedFixture();await f.retire('cn-company','licence');
  await expect(readTopic(deps(f),'cn-company',{})).rejects.toMatchObject({code:'topic_retired',status:410,detail:{reason:'licence'}});
 });
 it('serves the frozen drawer for one ordinal',async()=>{
  const e=await readEvidence(deps(publishedFixture()),'rates-and-banks',1);
  expect(e.drawer).toMatchObject({kind:'macro_observation'});expect(e.version_no).toBe(2);
  await expect(readEvidence(deps(publishedFixture()),'rates-and-banks',99)).rejects.toEqual(new TopicError('not_found'));
 });
 it('D9: marks a version older than 90 days stale',async()=>{
  const d=await readTopic(deps(publishedFixture(),'2027-03-01T00:00:00Z'),'rates-and-banks',{});
  expect([d.stale,d.age_days>90]).toEqual([true,true]);
 });
});
```

- [ ] **Step 2: Run** · Expected: FAIL, `Cannot find module './public-read'`.
- [ ] **Step 3: Implement** `public-read.ts` (uses `versionAtAsOf` and `maskSnapshot` from T3.3: write T3.3 first if working strictly in order, or stub them and finish there).
- [ ] **Step 4: Run** · Expected: PASS (9).
- [ ] **Step 5: Commit** (`feat(topics): public read service`).

### Task T3.3: `asOf` selection, read-time masking, staleness

**Files:** Create `src/lib/topics/asof.ts`, `src/lib/topics/masking.ts`, `src/lib/topics/asof.test.ts`, `src/lib/topics/masking.test.ts`

```ts
// asof.ts
export type AsOfPick={kind:'ok';version_no:number}|{kind:'no_version'}|{kind:'unpublished';version_no:number};
export function versionAtAsOf(versions:readonly {version_no:number;published_at:string;unpublished_at:string|null}[],asOf:string,today:string):AsOfPick;
export const ageDays=(publishedAt:string,now:Date):number=>Math.floor((now.getTime()-Date.parse(publishedAt))/86_400_000);
export const DRIFT_STALE_HOURS=72;
export const driftUnchecked=(checkedAt:string|null,now:Date):boolean=>checkedAt===null||now.getTime()-Date.parse(checkedAt)>DRIFT_STALE_HOURS*3_600_000;
// masking.ts
export const MASKING_DRIFTS=['retracted','now_withheld'] as const;
export function maskSnapshot(snapshot:TopicSnapshot,drift:ReadonlyMap<number,DriftRow>,view:'current'|'version'|'replay'):
 {evidence:PublicEvidence[];drawers:Map<number,Resolved['drawer']>;summary:(RenderedSummary&{hidden_points:number})|null};
```

- [ ] **Step 1: Failing tests**

```ts
// src/lib/topics/asof.test.ts
import {describe,expect,it} from 'vitest';
import {TopicError} from './errors';
import {ageDays,driftUnchecked,versionAtAsOf} from './asof';
const V=[{version_no:1,published_at:'2026-11-01T09:00:00.000Z',unpublished_at:null},{version_no:2,published_at:'2026-11-08T09:00:00.000Z',unpublished_at:null}];
describe('versionAtAsOf (spec §6.2, A5)',()=>{
 it.each([['2026-10-31',{kind:'no_version'}],['2026-11-01',{kind:'ok',version_no:1}],['2026-11-07',{kind:'ok',version_no:1}],
  ['2026-11-08',{kind:'ok',version_no:2}],['2026-11-15',{kind:'ok',version_no:2}]] as const)('asOf %s → %j',(d,want)=>{
  expect(versionAtAsOf(V,d,'2026-11-15')).toEqual(want);
 });
 it('answers unpublished for the version that was current then, whenever it was withdrawn; never silently falls back',()=>{
  const u=[V[0],{...V[1],unpublished_at:'2026-11-12T00:00:00.000Z'}];
  expect(versionAtAsOf(u,'2026-11-08','2026-11-15')).toEqual({kind:'unpublished',version_no:2});
  expect(versionAtAsOf(u,'2026-11-14','2026-11-15')).toEqual({kind:'unpublished',version_no:2});
  expect(versionAtAsOf(u,'2026-11-01','2026-11-15')).toEqual({kind:'ok',version_no:1});
 });
 it('rejects a future or malformed date',()=>{
  expect(()=>versionAtAsOf(V,'2026-11-16','2026-11-15')).toThrow(new TopicError('invalid_parameter:asOf'));
  expect(()=>versionAtAsOf(V,'11/08/2026','2026-11-15')).toThrow(new TopicError('invalid_parameter:asOf'));
 });
});
it('ageDays and the 72-hour drift rule (A15)',()=>{
 expect(ageDays('2026-11-01T00:00:00.000Z',new Date('2026-11-15T12:00:00Z'))).toBe(14);
 expect(driftUnchecked(null,new Date())).toBe(true);
 expect(driftUnchecked('2026-11-12T00:00:00.000Z',new Date('2026-11-14T23:00:00Z'))).toBe(false);
 expect(driftUnchecked('2026-11-12T00:00:00.000Z',new Date('2026-11-15T01:00:00Z'))).toBe(true);
});
```

```ts
// src/lib/topics/masking.test.ts
import {describe,expect,it} from 'vitest';
import {canonicalJson,sha256Hex} from '@/lib/evidence/hash';
import {maskingFixture} from './fixtures/published';
import {maskSnapshot} from './masking';
describe('read-time masking (spec §5.4, A5b)',()=>{
 const f=maskingFixture();   // evidence 1 ok (value '3.75'), 2 ok ('4.3'), 3 ok ('1000'); summary facts ev:1, ev:2, ev:3; point A cites ev:1+ev:3, point B cites ev:2
 it('shows revised and newer_period in current and version views but not in replay',()=>{
  const d=new Map([[2,{version_id:'v',ordinal:2,drift:'revised' as const,current_identity:{value_text:'4.2',unit:'pct',period:'2026-08',available_at:'2026-10-03T12:30:00.000Z'}}]]);
  expect(maskSnapshot(f.snapshot,d,'current').evidence[1]).toMatchObject({drift:'revised',masked:false,current:{value_text:'4.2'}});
  expect(maskSnapshot(f.snapshot,d,'replay').evidence[1]).toMatchObject({drift:null,masked:false,current:null});
 });
 it.each(['retracted','now_withheld'] as const)('%s removes the value, the drawer payload and the summary sentences in every view',drift=>{
  const d=new Map([[3,{version_id:'v',ordinal:3,drift,current_identity:null}]]);
  for(const view of ['current','version','replay'] as const){
   const out=maskSnapshot(f.snapshot,d,view);
   expect(out.evidence[2]).toMatchObject({masked:true,fact:null,drift});
   expect(out.drawers.get(3)).toEqual({kind:'financial_fact',identity:expect.any(Object),reason:drift});
   expect(out.summary!.facts.find(x=>x.fact_id==='ev:3')!.text).toBe('');
   expect(out.summary!.points.map(p=>p.fact_ids)).toEqual([['ev:2']]);expect(out.summary!.hidden_points).toBe(1);
   expect(JSON.stringify(out)).not.toContain('1000');
  }
 });
 it('never changes the snapshot it was given',()=>{
  const before=sha256Hex(canonicalJson(f.snapshot));
  maskSnapshot(f.snapshot,new Map([[3,{version_id:'v',ordinal:3,drift:'retracted',current_identity:null}]]),'current');
  expect(sha256Hex(canonicalJson(f.snapshot))).toBe(before);
 });
});
```

- [ ] **Step 2: Run** · Expected: FAIL, modules not found.
- [ ] **Step 3: Implement.** `versionAtAsOf`: validate `^\d{4}-\d{2}-\d{2}$` and `asOf <= today`; candidate = greatest `version_no` with `published_at <= asOf + 'T23:59:59.999Z'`; none → `no_version`; candidate `unpublished_at !== null` → `unpublished`. `maskSnapshot` builds new objects only (structured clone of what it changes).
- [ ] **Step 4: Run** `npm test -- src/lib/topics/asof.test.ts src/lib/topics/masking.test.ts src/lib/topics/public-read.test.ts` · Expected: PASS. Add to `public-read.test.ts` the A5 case end to end: after `unpublishCurrent`, `readTopic(…, {asOf:'2026-11-08'})` rejects with `version_unpublished`, `{asOf:'2026-10-31'}` with `no_version_at_asof`, `{asOf:'2026-11-01'}` returns v1 with `view:'replay'`.
- [ ] **Step 5: Commit** (`feat(topics): asOf replay selection and read-time masking`).

### Task T3.4: the five public routes

**Files:**
- Create: `src/app/api/topics/route.ts`, `src/app/api/topics/[slug]/route.ts`, `src/app/api/topics/[slug]/versions/route.ts`, `src/app/api/topics/[slug]/versions/[n]/route.ts`, `src/app/api/topics/[slug]/evidence/[ordinal]/route.ts`
- Test: `src/app/api/topics/routes.test.ts`

Each file: `export const dynamic='force-dynamic'` and one `GET=topicRoute(tag, …)`. Parameters through `readParams(url, allowed)` (a repeated or unknown parameter → 400 `invalid_parameter:<name>`). Allowed: list `category,q,cursor,limit`; dossier `asOf`; evidence `version`. `slug` must match the slug regex, `n` and `ordinal` `^[1-9]\d{0,3}$`, else `not_found`.

- [ ] **Step 1: Failing test** (`routes.test.ts`, mocking `@/lib/topics/deps` `publicDeps` with `publishedFixture()` and `requireSessionUser`):

```ts
it('A1: every route is 404 topics_disabled while TOPICS_ENABLED is unset',async()=>{
 delete process.env.TOPICS_ENABLED;
 for(const [mod,url,ctx] of ROUTES){const res=await mod.GET(new Request(url),ctx);expect(res.status,url).toBe(404);expect((await res.json()).error.code).toBe('topics_disabled');}
});
it('401 without a session',async()=>{ /* requireSessionUser → {ok:false,response:401} */ });
it('GET /api/topics returns items and nextCursor, no-store',async()=>{
 const res=await list.GET(new Request('http://x/api/topics?category=macro'),{params:Promise.resolve({})});
 expect(res.status).toBe(200);expect(res.headers.get('cache-control')).toBe('private, no-store');
 expect((await res.json()).items.map((i:{slug:string})=>i.slug)).toEqual(['rates-and-banks']);
});
it.each([['?limit=0','invalid_parameter:limit'],['?limit=201','invalid_parameter:limit'],['?category=sports','invalid_parameter:category'],
 ['?category=macro&category=macro','invalid_parameter:category'],['?q='+'长'.repeat(33),'invalid_parameter:q'],['?page=2','invalid_parameter:page']])('GET /api/topics%s → 400 %s',async(qs,code)=>{
 const res=await list.GET(new Request('http://x/api/topics'+qs),{params:Promise.resolve({})});
 expect(res.status).toBe(400);expect((await res.json()).error.code).toBe(code);
});
it('GET /api/topics/[slug]?asOf before the first version → 404 no_version_at_asof',async()=>{ /* asOf=2026-10-31 */ });
it('GET /api/topics/[slug]/versions/[n] for an unpublished version → 410 with meta only',async()=>{
 /* body: {error:{code:'version_unpublished',…},meta:{version_no:2,reason:'privacy'}}; JSON text does not contain any value_text of v2 */ });
it('GET /api/topics/[slug]/evidence/[ordinal] returns the frozen drawer',async()=>{ /* status 200, body.drawer.kind */ });
```

Write each commented case as a real assertion using the fixture's known values (v2 evidence 1 value `'3.75'`).

- [ ] **Step 2: Run** `npm test -- src/app/api/topics/routes.test.ts` · Expected: FAIL, route modules not found.
- [ ] **Step 3: Implement** the five files (each under 25 lines).
- [ ] **Step 4: Run** · Expected: PASS.
- [ ] **Step 5: Commit** (`feat(topics): public read routes`).

### Task T3.5: directory page (`TopicDirectory`)

**Files:**
- Create: `src/app/(app)/intel/topics/page.tsx`, `src/components/topics/directory/{DirectoryClient.tsx,TopicCard.tsx,DirectoryStates.tsx,directory-model.ts,directory-model.test.ts}`, `src/app/(app)/intel/topics/pages.test.ts`
- Modify: `messages/{zh,en}/topics.json`

Page (server): `if(!topicsEnabled()) notFound()`; `isAdmin` = `requireAdminUser()` succeeded; data = `listTopics(await publicDeps(), …)`; when the list is empty and `isAdmin`, read `previewDeps()` instead and pass `preview: !settings.public_enabled`; a non-admin whose read throws `not_found` → `notFound()` (A2). Renders `PageHeader` (title `meta.title` + `meta.titleEn`, scope `meta.scope`, controls: title search, 管理专题 link to `/admin/topics` for admins, `MarkLegend`), then `DirectoryClient`.

`DirectoryClient` (client): category segment (全部 / 宏观 / 行业 / 公司 / 跨市场 / 方法 as `aria-pressed` buttons, state in the URL `?category=`), title search (`?q=`, debounced 300 ms), fetches `/api/topics`, "load more" on `nextCursor`; grid `grid-cols-1 md:grid-cols-2 xl:grid-cols-3`; four states from the artboard: skeleton (four bars), empty user ("尚无已发布专题" / "专题发布后会出现在这里。"), empty admin (+ `去创建` → `/admin/topics/new`), error ("读取失败（{code}）" / "本页不缓存，没有可退回的旧结果。" / 重试).

`TopicCard` rows, in the artboard's order: (1) category chip + `v{n} · {date}` mono, (2) title, (3) dek, (4) evidence bar: label 证据, then one chip per non-zero count using text + number (`正常 12`, `StateBadge` for `missing / withheld / notServed / retracted` with the count as `detail`, local badge for `unsupported`), (5) badges: `{n} 条证据发布后已修订` when `drift_counts.revised>0`, `过期 · 超过 90 天未更新` when `stale`, `大部分数值受限` when withheld > half (X23). No cover image, no read count. The whole card is one link to `/intel/topics/{slug}`.

- [ ] **Step 1: Failing model test**

```ts
// src/components/topics/directory/directory-model.test.ts
import {describe,expect,it} from 'vitest';
import {cardModel,COUNT_ORDER} from './directory-model';
const item=(o:Partial<Parameters<typeof cardModel>[0]>={})=>({slug:'a',category:'macro' as const,title:{zh:'利率',en:'Rates'},dek:{zh:'d',en:'d'},version_no:3,published_at:'2026-11-08T09:00:00.000Z',
 evidence_counts:{ok:12,missing:2,withheld:1,not_served:0,unsupported:0,retracted:0},drift_counts:{revised:2,newer_period:0,retracted:0,now_withheld:0,unverifiable:0},stale:false,...o});
describe('directory card model',()=>{
 it('orders the status chips and drops zero counts',()=>{
  expect(COUNT_ORDER).toEqual(['ok','missing','withheld','not_served','unsupported','retracted']);
  expect(cardModel(item(),'zh').counts).toEqual([{state:'ok',n:12},{state:'missing',n:2},{state:'withheld',n:1}]);
 });
 it('builds the version line and picks the locale',()=>{expect(cardModel(item(),'en')).toMatchObject({title:'Rates',versionLine:'v3 · 2026-11-08',href:'/intel/topics/a'});});
 it('shows the revised badge, the stale badge and the mostly-withheld chip only when they apply',()=>{
  expect(cardModel(item(),'zh').badges).toEqual([{kind:'revised',n:2}]);
  expect(cardModel(item({stale:true,drift_counts:{revised:0,newer_period:0,retracted:0,now_withheld:0,unverifiable:0}}),'zh').badges).toEqual([{kind:'stale'}]);
  expect(cardModel(item({evidence_counts:{ok:3,missing:0,withheld:9,not_served:0,unsupported:0,retracted:0}}),'zh').badges).toContainEqual({kind:'mostlyWithheld'});
  expect(cardModel(item({evidence_counts:{ok:6,missing:0,withheld:6,not_served:0,unsupported:0,retracted:0}}),'zh').badges).not.toContainEqual({kind:'mostlyWithheld'});
 });
});
```

`pages.test.ts` (source assertions, same style as the foreign-research `pages.test.ts`): the page file contains `topicsEnabled()` before any data read and `notFound()`; `DirectoryClient.tsx` contains no hex colour (`/#[0-9a-fA-F]{3,8}\b/`), uses `font-mono tabular-nums` where it prints `version_no` or a count, and imports from `@/components/research-ui`; no file under `src/components/topics` mounts `ResearchChain`.

- [ ] **Step 2: Run** · Expected: FAIL, `Cannot find module './directory-model'`.
- [ ] **Step 3: Implement** model, components, page, and the messages. Keys under `topics`: `meta.*`, `directory.{searchLabel,searchPlaceholder,manage,categories.{all,macro,industry,company,cross_market,method},evidence,ok,revisedBadge,staleBadge,mostlyWithheld,previewBanner.title,previewBanner.body,states.{emptyTitle,emptyUser,emptyAdmin,create,errorTitle,errorBody,retry},loadMore}`; zh copy is the artboard's, en is a direct rendering (for example `previewBanner.title` "目录未对外 · 预览" / "Directory not public · preview", `revisedBadge` "{n} 条证据发布后已修订" / "{n} evidence items revised since publication").
- [ ] **Step 4: Run** `npm test -- src/components/topics src/app/\(app\)/intel/topics src/lib/topics/messages-parity.test.ts` · Expected: PASS.
- [ ] **Step 5: Commit** (`feat(topics): directory page`).

### Task T3.6: fixture mode

**Files:** Create `src/lib/topics/e2e-fixture.ts`, `src/lib/topics/e2e-fixture.test.ts`; Modify `src/lib/topics/deps.ts`, `src/lib/topics/flags.ts`

- [ ] **Step 1: Failing test**

```ts
import {describe,expect,it} from 'vitest';
import {fixtureMode} from './e2e-fixture';
import {topicsEnabled} from './flags';
describe('topic fixture mode fails closed',()=>{
 it.each([[{TOPICS_E2E_FIXTURES:'1',NODE_ENV:'development'},true],[{TOPICS_E2E_FIXTURES:'1',NODE_ENV:'production'},false],
  [{TOPICS_E2E_FIXTURES:'1',NODE_ENV:'development',VERCEL:'1'},false],[{TOPICS_E2E_FIXTURES:'1',NODE_ENV:'development',NEXT_PUBLIC_SUPABASE_URL:'x'},false],
  [{TOPICS_E2E_FIXTURES:'1',NODE_ENV:'development',SUPABASE_SERVICE_ROLE_KEY:'x'},false],[{NODE_ENV:'development'},false]] as const)('%j → %s',(env,on)=>{
  expect(fixtureMode(env)).toBe(on);
 });
 it('turns the module on in fixture mode without TOPICS_ENABLED',()=>{expect(topicsEnabled({TOPICS_E2E_FIXTURES:'1',NODE_ENV:'development'})).toBe(true);});
});
```

- [ ] **Step 2: Run** · Expected: FAIL.
- [ ] **Step 3: Implement.** `fixtureMode` copies `src/lib/industry/e2e-fixture.ts::fixtureMode` with the topic variable; `topicsEnabled(env)` becomes `env.TOPICS_ENABLED==='1' || fixtureMode(env)`; `fixtureDeps()` returns `{db: publishedFixture().db (switch on), now, preview:false}` as a module-level singleton; `publicDeps()` and `adminDeps()` branch on `fixtureMode()` first (admin: memory db + `memoryResolver(allFixtures())`). Update `flags.test.ts` expectations accordingly (the `'1'`-only table still holds with no fixture variable).
- [ ] **Step 4: Run** `npm test -- src/lib/topics` · Expected: PASS.
- [ ] **Step 5: Commit** (`feat(topics): fail-closed fixture mode for local e2e`).

**PR-3 gate:** `npm test`, `npm run build`, PG gate. Manual check in fixture mode: `TOPICS_E2E_FIXTURES=1 npm run dev` with no `.env*` present, open `/intel/topics`, compare with `TopicDirectory` at 1440 px and 390 px.

---

## PR-4: dossier (branch `claude/topics-pr4-dossier`, after PR-3)

All components live in `src/components/topics/dossier/`. The page fetches on the server (`readTopic`) and passes the `DossierDto` to client components; the drawer fetches `/api/topics/[slug]/evidence/[ordinal]` on open.

### Task T4.1: routes and page shell

**Files:** Create `src/app/(app)/intel/topics/[slug]/page.tsx`, `src/app/(app)/intel/topics/[slug]/v/[n]/page.tsx`, `src/components/topics/dossier/DossierView.tsx`, `src/components/topics/dossier/dossier-model.ts`, `…/dossier-model.test.ts`

Page: `topicsEnabled()` else `notFound()`; `searchParams.asOf` → `readTopic(deps, slug, {asOf})`; `/v/[n]` → `{version:n}`. `TopicError` mapping: `not_found` / `no_version_at_asof` → `notFound()` for a plain read, but `no_version_at_asof` on a replay renders the page frame with the replay banner text "该日尚无已发布版本"; `version_unpublished` and `topic_retired` render the frame with the unpublished / retired banner and no content. Order of blocks (spec §7.2): version bar → banner → breadcrumb (`专题研究 / {category}`), `h1` title + category chip, dek → summary panel (when `summary`) → sections → entries + footer (two columns ≥ 1024 px).

- [ ] **Step 1: Failing model test**: `dossierModel(dto, locale)` returns `{breadcrumb, title, dek, banner, sections:[{key,title,noteParts,rows,judgments,slots,chart}], entries, footer}`; assert (a) `banner` is exactly one of `null | {kind:'superseded',current:n} | {kind:'unpublished',reason} | {kind:'replay',asOf}` and that `superseded` wins only in `view:'version'`, `replay` only in `view:'replay'`; (b) section `rows` contain only non-judgment evidence in ordinal order and `judgments` only `kind==='judgment'` (X22); (c) `slots` are the section's `expected_slot` items resolved against `dto.expected_slots`; (d) `noteParts` come from `renderSlots(note[locale], lookup)` where `lookup` formats an `ok` fact with `formatSlot(slots.value, locale)` and returns `text:null` for a masked item.
- [ ] **Step 2: Run** `npm test -- src/components/topics/dossier/dossier-model.test.ts` · Expected: FAIL, module not found.
- [ ] **Step 3: Implement** model, `DossierView`, the two pages.
- [ ] **Step 4: Run** · Expected: PASS.
- [ ] **Step 5: Commit** (`feat(topics): dossier page shell and model`).

### Task T4.2: version bar and banners

**Files:** Create `…/VersionBar.tsx`, `…/DossierBanner.tsx`, `…/version-bar-model.ts`, `…/version-bar-model.test.ts`

Bar content, left to right (artboard): cap 版本条; chip `v{n} · 当前` (or `v{n}`); chip `发布 {YYYY-MM-DD}`; chip `证据截至 {cutoff, UTC to the minute}`; `共 {total} 版` select → navigates to `/intel/topics/{slug}/v/{n}` (current → `/intel/topics/{slug}`); spacer; `回放 截至` date input (max = today) → `?asOf=`; `版本管理` link to `/admin/topics/{id}/publish` for admins only. When `drift_unchecked` is true, a `FreshnessChip`-styled warn chip "证据状态未能核对" (A15) plus "漂移检查截至 {drift_checked_at}". Phone: one line `v3 · 当前 · 发布 {date}` and the select collapsed to `共 3 版 ▾`.

Banners (mutually exclusive, fixed under the bar): superseded "你正在看 v{n}，它已被 v{m} 取代" + link 看当前版本; unpublished "v{n} 已取消发布" + "原因类别：{category}。内容不再提供，只保留版本号与原因。"; replay "回放视图 · 截至 {date}" + "显示该日已发布的版本与当时已可得的证据。" + 回到现在.

- [ ] **Step 1: Failing test**: `versionBarModel(dto, {isAdmin, today})` → asserts chip texts, the select options in descending order with unpublished versions labelled and disabled, `adminHref` null for non-admins, `driftChip` present only when `drift_unchecked`.
- [ ] **Steps 2–5:** run (fail) → implement → run (pass) → commit (`feat(topics): version bar and banners`).

### Task T4.3: badges for states and drift

**Files:** Create `src/components/topics/TopicBadge.tsx`, `src/components/topics/badge-model.ts`, `src/components/topics/badge-model.test.ts`

- [ ] **Step 1: Failing test**

```ts
import {describe,expect,it} from 'vitest';
import {driftBadge,stateBadge} from './badge-model';
describe('topic badges (X7)',()=>{
 it.each([['ok',{kind:'ok'}],['missing',{kind:'shared',state:'missing'}],['withheld',{kind:'shared',state:'withheld'}],['not_served',{kind:'shared',state:'notServed'}],
  ['retracted',{kind:'shared',state:'retracted'}],['unsupported',{kind:'local',key:'states.unsupported',shape:'dashed',tone:'neutral'}]] as const)('state %s',(s,want)=>{
  expect(stateBadge(s,'reason_x')).toMatchObject({...want,reasonKey:s==='ok'?null:'reasons.reason_x'});
 });
 it.each([['revised',{kind:'shared',state:'revised'}],['newer_period',{kind:'local',key:'drift.newer_period',shape:'solid',tone:'warn'}],
  ['now_withheld',{kind:'local',key:'drift.now_withheld',shape:'dotted',tone:'neutral'}],['retracted',{kind:'shared',state:'retracted'}],
  ['unverifiable',{kind:'local',key:'drift.unverifiable',shape:'dashed',tone:'neutral'}]] as const)('drift %s',(d,want)=>{expect(driftBadge(d)).toMatchObject(want);});
 it('adds the reconstruction mark for basis reconstruction',async()=>{const {basisBadge}=await import('./badge-model');expect(basisBadge('reconstruction')).toEqual({kind:'shared',state:'reconstructed'});expect(basisBadge('point_in_time')).toBeNull();});
});
```

- [ ] **Step 3: Implement.** `TopicBadge` renders `StateBadge` for `shared`, a `<span data-topic-state>` with the same class recipe as `StateBadge` (shape → `border-dashed|dotted|solid`, tone classes copied from its `tones` map) for `local`, and the plain "正常" chip with a dot for `ok`. Message keys: `states.unsupported` 不支持 / Not supported; `drift.newer_period` 有更新期 / Newer period available; `drift.now_withheld` 现已受限 · 读时遮蔽 / Now withheld · masked on read; `drift.unverifiable` 无法核验 / Cannot be verified; `reasons.*` one per reason code produced in T2.4–T2.7 (for example `reasons.citation_pending` 引用核对未完成 / Citation check not complete, `reasons.not_yet_available` 当时尚不可得 / Not yet available at that time, `reasons.quarantined` 数据质量隔离 / Quarantined for data quality, `reasons.hk_not_served` 港股 / Hong Kong shares, `reasons.foreign_research_not_wired` 外资研报尚未接入 / Foreign research not connected yet). Add a test that every reason code in `SAMPLES` (T2.7) has a `reasons.<code>` key in both locales.
- [ ] **Steps 2, 4, 5:** run (fail) → run (pass) → commit (`feat(topics): state and drift badges`).

### Task T4.4: sections, evidence rows, expected slots, judgment cards

**Files:** Create `…/SectionBlock.tsx`, `…/EvidenceTable.tsx`, `…/ExpectedSlotRow.tsx`, `…/JudgmentBlock.tsx`, `…/evidence-row-model.ts`, `…/evidence-row-model.test.ts`

Table columns (artboard): `#`, 证据 (label + small kind name), 事实句, 期别, 可得时间, 状态, 漂移, 来源 ▸. Row rules: `ok` → fact sentence with the value as a button that opens the drawer (`font-mono tabular-nums`), `basis==='reconstruction'` adds the 重建口径，非时点 badge; `revised` → drift badge with detail `现行 {formatSlot(current)}`; `newer_period` → detail `{current.period} 已发布`; masked → fact cell "发布时为 [已遮蔽]", state "正常（发布时）", drift 现已受限 or 已撤回; non-ok → dimmed row, fact / available cells "—", state badge with reason; `not_served` and `unsupported` rows have no 来源 button. Reconstruction-basis rows are grouped after point-in-time rows inside the table with a sub-caption (spec §4.1: not compared in one table). Expected slot: dashed row `预期证据槽` + label + reason text + mono reason code. Judgment block: `MarkCard kind="judgment"`, chips for lifecycle, calibration state and `method@version`; "登记于 {registered_at} 的判定类别：{claim}"; no percentage unless `calibrationStateOf` allows it (the card data comes from `toCard` applied in T2.7's resolver to `display.fact.slots`; the block prints only slots).

- [ ] **Step 1: Failing test**: `evidenceRowModel(e, locale)` for the ten rows of the artboard (ok; revised; newer_period; reconstruction + unverifiable; withheld; missing; not_served; unsupported; retracted; masked) asserting for each `{factText, valueButton:boolean, stateBadge, driftBadge, sourceButton:boolean, dim:boolean}`; plus: a row with `state!=='ok'` or `masked` has `factText` with no digit (`/\d/` fails).
- [ ] **Steps 2–5:** run (fail) → implement → run (pass) → commit (`feat(topics): section evidence table, expected slots and judgment cards`).

### Task T4.5: drawer adapter

**Files:** Create `…/topic-drawer-adapter.ts`, `…/topic-drawer-adapter.test.ts`, `…/TopicSourceDrawer.tsx`

```ts
export const topicDrawerInput:SourceDrawerAdapter<{detail:EvidenceDetailDto;locale:'zh'|'en';text:DrawerText}>;
```

Mapping: `masked` or `state==='retracted'` → `{variant:'retracted', kind, identity, retraction:{category: text('reasons.'+reason), at:null}}`; `state==='withheld'` or drift `now_withheld` → `{variant:'withheld', kind, identity, reason:{code, text}}`; drift `revised` with `current` → `{variant:'revised', payload, revised:{frozen:{value, available_at}, current:{value, available_at}}}`; `ok` → `{variant:'ok', payload, extras:{mark: kind==='judgment'?'judgment':'fact', as_of: ref.as_of, value, period}}`; `missing / not_served / unsupported` open no drawer. `TopicSourceDrawer` owns the fetch (pending → `pending` sections, failure → `failed`), passes `text` resolving `attribution_key` and `licence.note_key` through `topics.attribution.*` (keys `macro:attribution`, `facts:sec`, `facts:cninfo`, `industry:sic`, `industry:sw2021`, `judgments:method`; D8) and restores focus to the opener.

- [ ] **Step 1: Failing test**: one case per variant above with literal expected objects; one asserting that the `withheld` and `retracted` outputs contain no `payload` key and no digit sequence from the fixture value.
- [ ] **Steps 2–5:** run (fail) → implement → run (pass) → commit (`feat(topics): source drawer adapter over the unified drawer`).

### Task T4.6: chart and table for repeated series

**Files:** Create `…/SeriesBlock.tsx`, `…/series-model.ts`, `…/series-model.test.ts`

A section gets a `ChartTableSwitch` when it holds two or more `macro_observation` items whose `fact.slots.series` is the same. `seriesModel(rows)` → `{series, points:[{x:period, y:number|null}], tableRows}`; only `ok`, unmasked items contribute a `y`; any other item in the period range contributes `y:null`; the chart draws `lineSegments(points)` segment by segment (no interpolation) with a "缺失" label at gaps; the table view lists every item with its state.

- [ ] **Step 1: Failing test**: three ok points and one withheld between them → `lineSegments` yields two segments; a section with one observation per series → `seriesModel` returns `null`; a masked item yields `y:null`; the table rows equal the item count (A17).
- [ ] **Steps 2–5:** run (fail) → implement → run (pass) → commit (`feat(topics): series chart with table equivalent`).

### Task T4.7: entries and footer

**Files:** Create `…/EntriesBlock.tsx`, `…/DossierFooter.tsx`, `…/footer-model.ts`, `…/footer-model.test.ts`

Entries: `owner_note` → card "编者笔记" with the body rendered through `renderSlots`; `licensed_excerpt` entries render nothing in PR-4 (the type cannot be saved before PR-10). Footer (`dl`): 证据状态汇总 (six counts, text + number), 发布时新鲜度 (one `FreshnessChip` per dataset in `freshness_at_publication`) with "距发布 {age_days} 天" (spec §5.3), 受限市场说明 (three fixed sentences, each shown only when relevant: CN values withheld when any `financial_fact` is `withheld`; 港股未服务 when any `not_served`; 行业数据尚未发布 when any expected slot has `industry_not_published`), 来源署名 (distinct `attribution_key` texts of `ok` evidence, D8), FRED 序列 note when any macro item is `withheld:licence_unconfirmed` or `catalog_restricted` (D7), then `ResearchFooter` with the publisher/relay list and the one disclaimer.

- [ ] **Step 1: Failing test**: `footerModel(dto, text)` → counts in `COUNT_ORDER`; market notes present only under the three conditions; attributions de-duplicated and sorted; FRED note flag.
- [ ] **Steps 2–5:** run (fail) → implement → run (pass) → commit (`feat(topics): entries and footer`).

### Task T4.8: summary panel (render only)

**Files:** Create `…/SummaryPanel.tsx`, `…/summary-model.ts`, `…/summary-model.test.ts`

Rendered only when `dto.summary` is non-null (always null until PR-9; fixtures carry one). Header: 摘要 + chip `已批准 · {provider} / {model}`; sub-line "事实句由系统从冻结证据生成；机制假设由模型生成，未经核实。"; left `MarkCard kind="fact"` with the fact sentences, each ending in `[n]` buttons that open the drawer for that ordinal; a muted line "证据 [a] 与 [b] 期别不同，不生成变化句。" per `incomparable` pair; right `MarkCard kind="hypothesis"` titled 假设与反方 · 未经核实 with points and counterpoints (counterpoints prefixed 反方), each ending in its `refs`. A masked fact sentence shows "所依据的证据已撤回/受限"; `hidden_points>0` adds "{n} 条假设因所依据的证据已撤回或受限而隐藏". Phone: the two cards stack, facts first.

- [ ] **Step 1: Failing test**: `summaryModel(summary)` → every rendered sentence has a non-empty `refs` array (A9), masked facts map to the notice key, `hidden_points` surfaces, and no point text contains a digit.
- [ ] **Steps 2–5:** run (fail) → implement → run (pass) → commit (`feat(topics): summary panel`).

### Task T4.9: phone layout (`M-Topic`)

**Files:** Modify the dossier components; Create `src/components/topics/dossier/layout.test.ts`

Below 768 px: version bar one line; summary cards stacked; each evidence row becomes a card (ordinal + label + state badge on line one; fact sentence; "可得 {date} · {kind}"; drift badge; 来源 button ≥ 44 px tall); expected slot and judgment card full width; footer single column; drawer full screen (already provided by `SourceDrawer`). No horizontal page scroll; the wide table is replaced by cards, not scrolled.

- [ ] **Step 1: Failing test** (source assertions): `EvidenceTable.tsx` has a `md:hidden` card list and a `hidden md:block` (or `md:table`) table; the 来源 control in the card has `min-h-[44px]`; no component sets a fixed pixel width above 390.
- [ ] **Steps 2–5:** run (fail) → implement → run (pass) → commit (`feat(topics): phone dossier layout`).

**PR-4 gate:** `npm test`, `npm run build`; fixture-mode visual comparison with `TopicDossier` (1440 px) and `M-Topic` (390 px), both locales.

---

## PR-5: admin editor (branch `claude/topics-pr5-editor`, after PR-1 and PR-2; parallel with PR-3/PR-4)

### Task T5.1: admin route helper

**Files:** Create `src/lib/topics/admin-route.ts`, `src/lib/topics/admin-route.test.ts`

Same behaviour as `src/lib/broker-research/admin-route.ts`, with `TopicError`: `adminGet(tag, fn)`, `adminPost(tag, fn)` (also used for `PUT`), `readJsonBody(request)` (`Content-Type` must start with `application/json` → else 415 `unsupported_media_type`; `Origin` header present and different from the request origin → 403 `forbidden_origin`; body must be a JSON object → 400 `invalid_body`), field readers `strField`, `intField`, `enumField`, `objField`, `uuidParam`, and `jsonNoStore`. Order inside the wrapper: `topicsEnabled()` (404 `topics_disabled`) → `requireAdminUser()` (401 `authentication_required` / 403 `admin_required`) → body → handler; `TopicsDbError(code)` is rethrown as `TopicError(code)`.

- [ ] **Step 1: Failing test**: flag off → 404 before the admin check runs; non-admin → 403; wrong content type → 415; foreign origin → 403; array body → 400; handler `TopicsDbError('revision_conflict')` → 409; every response `no-store`.
- [ ] **Steps 2–5:** run (fail) → implement → run (pass) → commit (`feat(topics): admin route helper`).

### Task T5.2: create and draft routes

**Files:** Create `src/lib/topics/drafts.ts`, `src/lib/topics/drafts.test.ts`, `src/app/api/admin/topics/route.ts` (GET list, POST create), `src/app/api/admin/topics/[id]/draft/route.ts` (GET, PUT), `src/app/api/admin/topics/admin-routes.test.ts`

`drafts.ts`: `parseDraftBody(raw:unknown):DraftBody` (throws `TopicError('invalid_body:<path>')`) enforcing: `title`/`dek` bilingual strings (title 1–120, dek 0–240 chars per locale); section `key` `^[a-z0-9-]{1,40}$` unique; evidence `ordinal` unique integers ≥ 1, `ref` valid under `parseRef` once `as_of` is defaulted, `section_key` exists; every `{ordinal}` item refers to existing evidence in that section and every evidence item is listed exactly once; `expected_slots` keys unique with `reason_code` in `SLOT_REASONS`; entries: `owner_note` only (`licensed_excerpt` → `invalid_body:entries` until PR-10); at most 200 evidence items and 20 sections. `emptyDraft(title:Bilingual):DraftBody`. `nextOrdinal(body)` = max ordinal + 1 (ordinals are never renumbered, so slots stay valid when evidence is removed).

`POST /api/admin/topics` body `{slug, category, title:{zh,en}}` → `db.createTopic` → 201 `{topic_id, revision, draft_hash}`; `slug_taken` → 409. `GET` → `db.adminTopics()` plus `db.settings()`. `PUT …/draft` body `{expected_revision, body}` → `parseDraftBody` → `db.saveDraft` → `{revision, draft_hash, lint}` where `lint` = per-field `ownerTextFailures` and dangling slots (advisory; the save succeeds with lint present).

- [ ] **Step 1: Failing tests**: `drafts.test.ts` one accepting case and one rejecting case per rule above with the exact `invalid_body:<path>` code; `admin-routes.test.ts` (memory db via mocked `adminDeps`): create → 201; same slug → 409 `slug_taken`; `PUT` with a stale revision → 409 `revision_conflict`; `PUT` with a body containing "失业率为 4.3%" in a note → 200 with `lint` containing `{field:'sections.s1.note.zh',code:'numeral_in_owner_text',match:'4.3%'}`.
- [ ] **Steps 2–5:** run (fail) → implement → run (pass) → commit (`feat(topics): create and draft routes with draft validation`).

### Task T5.3: evidence search

**Files:** Create `src/lib/topics/evidence-search.ts`, `src/lib/topics/evidence-search.test.ts`, `src/app/api/admin/topics/[id]/evidence-search/route.ts`

```ts
export type EvidenceQuery=
 |{kind:'macro_observation';series_id:string;period_end:string}
 |{kind:'financial_fact';ticker:string;concept:string;period_end:string}
 |{kind:'industry_metric';scheme:'sic'|'sw2021';code:string;metric:string;period_end:string}
 |{kind:'document_citation';document_id:string;page_no?:number}
 |{kind:'judgment';judgment_id:string};
export interface Candidate{ref:DraftRef;label:Bilingual;public:{state:ResolveState;reason:string|null;text:string|null};admin:{state:ResolveState;text:string|null;admin_only:boolean}}
export async function searchEvidence(d:{resolver:Resolver;lookup:CandidateLookup;now():Date},q:EvidenceQuery,asOf:string|null):Promise<Candidate[]>;
```

`CandidateLookup` finds candidate ids per kind (macro: every version of `(series_id, period_end)` through `EvidenceSources.macro.versions`; fact: issuer by ticker via `resolvePublicIssuer`, then facts by concept and period; industry: the active run's cell; citation: the document's public citations, optionally by page; judgment: the id itself). Each candidate is resolved twice (`public`, `admin`) and returned side by side; `text` is the fact sentence formatted with `formatSlot`, null unless `ok`. `kind=broker_report_meta` → 400 `invalid_parameter:kind` (the picker shows that chip disabled, "外资研报 · 不支持").

- [ ] **Step 1: Failing test** (memory sources): the macro query returns both versions with the right labels; a CN fact candidate has `public.state==='withheld'`, `public.text===null`, `admin.text` containing the value and `admin.admin_only===true`; the serialised `public` halves contain no withheld value; at most 20 candidates.
- [ ] **Steps 2–5:** run (fail) → implement → run (pass) → commit (`feat(topics): evidence picker search with two-projection preview`).

### Task T5.4: admin list page

**Files:** Create `src/app/(app)/admin/topics/page.tsx`, `src/app/(app)/admin/topics/new/page.tsx`, `src/app/(app)/admin/topics/_shared/gate.tsx`, `src/components/topics/admin/{TopicList.tsx,NewTopicForm.tsx,list-model.ts,list-model.test.ts}`; Modify `messages/{zh,en}/topicsAdmin.json`

Every admin page: `topicsEnabled()` else `notFound()`, then `adminGate('/admin/topics…')` (copy of the broker `_shared/gate.tsx`). List (artboard block "管理列表"): status segment 草稿 / 已发布 / 已取消 / 已退役 with counts, checkbox 只看有修订, button 新建专题; table 标题, 分类, 状态, 当前版本, 漂移 (`{n} 条已修订`), 起点 (`由私有论点晋升` when promoted), 编辑 link. Header chip `目录开关：未对外 / 已对外` (read-only, X13). New-topic form: slug (pattern shown, "创建后不可改" note, D6), category select, title zh/en → `POST /api/admin/topics` → redirect to `/admin/topics/{id}`.

- [ ] **Step 1: Failing test**: `listModel(rows, {status, revisedOnly})` → tab counts, filtering, `起点` text key, sort by `created_at desc`.
- [ ] **Steps 2–5:** run (fail) → implement → run (pass) → commit (`feat(topics): admin list and new-topic form`).

### Task T5.5: three-column editor (`TopicEditor`)

**Files:** Create `src/app/(app)/admin/topics/[id]/page.tsx`, `src/components/topics/admin/editor/{EditorClient.tsx,OutlineColumn.tsx,TextColumn.tsx,PickerColumn.tsx,FlowBar.tsx,editor-state.ts,editor-state.test.ts,lint-model.ts,lint-model.test.ts}`

`editor-state.ts` is a pure reducer over `DraftBody`:

```ts
export type EditorAction=
 |{type:'setTitle'|'setDek';locale:'zh'|'en';value:string}
 |{type:'addSection';key:string}|{type:'removeSection';key:string}|{type:'moveSection';key:string;dir:-1|1}
 |{type:'setSectionTitle'|'setSectionNote';key:string;locale:'zh'|'en';value:string}
 |{type:'addEvidence';section:string;ref:DraftRef}|{type:'removeEvidence';ordinal:number}|{type:'moveItem';section:string;index:number;dir:-1|1}
 |{type:'addSlot';section:string;slot:ExpectedSlot}|{type:'removeSlot';key:string}
 |{type:'insertSlotText';field:string;at:number;ordinal:number;part:'value'|'period'}
 |{type:'replaceWithSlot';field:string;match:string;ordinal:number}
 |{type:'setOwnerNote';key:string;locale:'zh'|'en';value:string}|{type:'addOwnerNote';key:string}|{type:'removeEntry';key:string};
export function reduce(body:DraftBody,a:EditorAction):DraftBody;
```

Columns (artboard): left 分节与证据 (drag handle button with `aria-label` "拖动排序 第 n 节", Arrow Up/Down moves the focused section or item, each evidence line `ev:{ordinal}` + label + public-state badge, 新增分节, 插入预期槽 which requires a reason select); middle 文字 (标题, 一句话摘要 dek, one note textarea per section, button 插入证据 `{{ev:n}}` inserting at the caret, lint list under the textarea: 裸数字 `numeral_in_owner_text` with action `换成 {{ev:n}}` offered when exactly one `ok` evidence item's formatted value equals the match, 建议用语 `advice_term`, 悬空插槽 `dangling_slot`; the note "提示只是预检；发布以底部“披露检查”的结果为准。"); right 证据选择器 (six kind chips, the sixth dashed and disabled; per-kind fields exactly as T5.3; 截至 date; 查找; candidates table 候选 / 公开视图 / 管理员视图 / 加入, with "仅管理员 · 不进入公开快照" under an admin-only value). Header chips: 草稿修订 {n} · 已保存 {time}; slug · 创建后不可改; 目录开关. Sticky flow bar: `1 保存` (saves; shows ✓ when the local body hash equals the saved `draft_hash`), `2 披露检查`, `3 生成摘要（可选）`, `4 批准摘要`, `5 预览`, `6 发布`: in PR-5 steps 2–6 are links to `/admin/topics/{id}/publish` (the page arrives in PR-6; until then the links are rendered disabled with `aria-disabled`). Autosave is not used: saving is explicit, a 409 shows "草稿已被其他会话更新" with a reload action.

- [ ] **Step 1: Failing tests**

```ts
// editor-state.test.ts (extract)
it('assigns ordinals that never repeat after a removal',()=>{
 let b=reduce(emptyDraft({zh:'t',en:'t'}),{type:'addSection',key:'s1'});
 b=reduce(b,{type:'addEvidence',section:'s1',ref:REF_A});b=reduce(b,{type:'addEvidence',section:'s1',ref:REF_B});
 b=reduce(b,{type:'removeEvidence',ordinal:1});b=reduce(b,{type:'addEvidence',section:'s1',ref:REF_C});
 expect(b.evidence.map(e=>e.ordinal)).toEqual([2,3]);expect(b.sections[0].items).toEqual([{ordinal:2},{ordinal:3}]);
});
it('refuses the same ref twice (ref_hash unique per version)',()=>{ /* second addEvidence with REF_A leaves the body unchanged */ });
it('replaceWithSlot swaps the first exact match in the named field only',()=>{
 /* note '失业率为 4.3%。' → '失业率为 {{ev:2}}。' */ });
it('every reduced body still passes parseDraftBody',()=>{ /* run a fixed sequence of 12 actions, parse after each */ });
```

`lint-model.test.ts`: `lintField(text, evidence)` returns the three artboard findings for the artboard's sample text `截至 {{ev:1.period}}，联邦基金有效利率为 {{ev:1}}。失业率为 4.3%，我们建议关注银行息差。见 {{ev:14}}。` with evidence 1 and 2 present: `[{code:'numeral_in_owner_text',match:'4.3%',fix:{ordinal:2}},{code:'advice_term',match:'建议'},{code:'dangling_slot',match:'{{ev:14}}'}]`.

Write the commented cases as real assertions.

- [ ] **Steps 2–5:** run (fail) → implement → run (pass) → commit (`feat(topics): three-column draft editor`).

**PR-5 gate:** `npm test`, `npm run build`; fixture-mode check of `/admin/topics` and the editor against `TopicEditor` at 1920 px and 1280 px.

---

## PR-6: publish flow (branch `claude/topics-pr6-publish`, after PR-5 and PR-3)

### Task T6.1: assemble

**Files:** Create `src/lib/topics/assemble.ts`, `src/lib/topics/assemble.test.ts`

```ts
export interface AssembleInput{topic:{slug:string;category:Category};draft:DraftBody;cutoff:string;summary:RenderedSummary|null}
export interface Assembled{snapshot:TopicSnapshot;snapshotText:string;snapshotHash:string;evidence:EvidenceRowInput[];
 adminResolved:Resolved[];maskedInPublic:number[];degraded:boolean;resolverErrors:number}
export const DEGRADED_SHARE=0.2;
export async function assemble(d:{resolver:Resolver;now():Date},i:AssembleInput):Promise<Assembled>;
```

Steps: order evidence by `ordinal`; `as_of` defaults to `cutoff`; any `as_of > cutoff` → `TopicError('publish_blocked:as_of_after_cutoff')`; duplicate `refHash` → `TopicError('publish_blocked:duplicate_ref')`; resolve once with `audience:'public'` and once with `audience:'admin'` (`locale:'zh'`: resolvers return bilingual labels and locale-free slots, so the snapshot is locale-neutral); `maskedInPublic` = ordinals where the admin result is `ok` and the public one is not; `degraded` = `resolver_error` count / evidence count > 0.2 (and count > 0); snapshot via `buildSnapshot` (T6.2).

- [ ] **Step 1: Failing test** (memory resolver from `allFixtures()`):

```ts
it('is idempotent: same draft and cutoff give the same snapshot hash',async()=>{
 const a=await assemble(deps,input),b=await assemble(deps,input);expect(a.snapshotHash).toBe(b.snapshotHash);expect(a.snapshotText).toBe(b.snapshotText);
});
it('defaults as_of to the cutoff and rejects a later one',async()=>{
 expect((await assemble(deps,input)).evidence.every(e=>e.as_of<=input.cutoff)).toBe(true);
 await expect(assemble(deps,withAsOf(input,1,'2027-01-01T00:00:00.000Z'))).rejects.toEqual(new TopicError('publish_blocked:as_of_after_cutoff'));
});
it('keeps only the public projection: no admin_only mark and no withheld value in the snapshot text',async()=>{
 const a=await assemble(deps,input);
 expect(a.snapshotText).not.toContain('admin_only');expect(a.snapshotText).not.toContain('987654321.12');expect(a.maskedInPublic).toEqual([3]);
});
it('flags a degraded batch above 20% resolver errors',async()=>{
 const a=await assemble({...deps,resolver:failingFor('macro_observation')},input);expect([a.degraded,a.resolverErrors]).toEqual([true,2]);
});
it('rejects the same ref twice',async()=>{ /* duplicate_ref */ });
```

- [ ] **Steps 2–5:** run (fail) → implement → run (pass) → commit (`feat(topics): assemble a draft into a public snapshot`).

### Task T6.2: snapshot builder

**Files:** Create `src/lib/topics/snapshot.ts`, `src/lib/topics/snapshot.test.ts`

```ts
export function countsOf(resolved:readonly Resolved[]):EvidenceCounts;
export function buildSnapshot(i:AssembleInput,ordered:readonly (DraftEvidence&{ref:EvidenceRef})[],publicResolved:readonly Resolved[],resolverVersions:Record<string,string>):
 {snapshot:TopicSnapshot;snapshotText:string;snapshotHash:string;evidence:EvidenceRowInput[]};
```

- [ ] **Step 1: Failing test**: (A3) `snapshot.evidence.length === draft.evidence.length` and every input ref appears with its `ref_hash`; `counts` sums to the evidence count; `freshness_at_publication` holds one entry per distinct `freshness.dataset`; `snapshotHash === sha256Hex(snapshotText)` and `JSON.parse(snapshotText)` deep-equals `snapshot`; `evidence[i].digest` is null exactly when `state!=='ok'`; expected slots, sections and entries are copied verbatim; `contract_version==='evidence-ref/1'`.
- [ ] **Steps 2–5:** run (fail) → implement → run (pass) → commit (`feat(topics): immutable snapshot builder`).

### Task T6.3: disclosure check (ten checks)

**Files:** Create `src/lib/topics/disclosure.ts`, `src/lib/topics/disclosure.test.ts`

```ts
export const DISCLOSURE_VERSION='topic-disclosure/1';
export const CHECK_KEYS=['evidence_kind','evidence_audience','private_fingerprint','unreviewed_block','lexical','excerpt','slots','summary','resolver_health','empty_dossier'] as const;
export interface DisclosureInput{draft:DraftBody;assembled:Pick<Assembled,'snapshot'|'degraded'>;privateIds:ReadonlySet<string>;
 summary:{status:'generated'|'approved'|'discarded';draft_hash:string;provider:string;model:string}|null;draftHash:string;
 settings:Pick<TopicSettingsRow,'summary_public_enabled'|'summary_provider_note'>;licences:ReadonlyMap<string,{status:'pending'|'approved'|'revoked';permits:Record<string,unknown>}>}
export function runDisclosure(i:DisclosureInput):{checks:DisclosureCheck[];passed:boolean;blocked:string[];warnings:string[]};
export function ownerTexts(draft:DraftBody):{field:string;text:string}[];   // title, dek, section titles and notes, owner_note bodies; both locales
```

| # | key | Blocks with | Rule |
|---|---|---|---|
| 1 | `evidence_kind` | `kind_unsupported` | any snapshot evidence with `state==='unsupported'` |
| 2 | `evidence_audience` | warning `mostly_withheld` | withheld count > half of the evidence count (D10); the count is recorded either way |
| 3 | `private_fingerprint` | `private_reference`, `identifier_in_text` | owner text contains an id from `privateIds` or the substring `/research/` → `private_reference`; any UUID shape or 64-hex string → `identifier_in_text` |
| 4 | `unreviewed_block` | `unreviewed_private_block` | any `blocks_provenance` value equal to `'from_thesis'` |
| 5 | `lexical` | `numeral_in_owner_text`, `advice_term`, `forbidden_term` | `ownerTextFailures` over `ownerTexts` |
| 6 | `excerpt` | `excerpt_violation` | a `licensed_excerpt` entry whose licence is not `approved` with `permits.display_excerpt===true`, or with more than 3 fragments, or a fragment over the cap (`EXCERPT_CAPS`, T10.4), or a missing attribution / date / https link |
| 7 | `slots` | `dangling_slot` | a slot whose ordinal is not in `draft.evidence` |
| 8 | `summary` | `summary_mismatch`, `summary_provider_unconfirmed`, `summary_provider_mismatch` | summary present and (`draft_hash` differs or status not `approved`) / `!summary_public_enabled` / the note does not contain the provider name (case-insensitive) |
| 9 | `resolver_health` | `resolver_degraded` | `assembled.degraded` |
| 10 | `empty_dossier` | `empty_dossier` | no evidence and no expected slot |

- [ ] **Step 1: Failing test**: for each of the ten checks one passing and one failing input built from a `cleanInput()` helper, asserting the check's `result` and `codes`; then:

```ts
it('returns the ten checks in order and passes only with no block',()=>{
 const r=runDisclosure(cleanInput());
 expect(r.checks.map(c=>[c.id,c.key])).toEqual(CHECK_KEYS.map((k,i)=>[i+1,k]));expect([r.passed,r.blocked,r.warnings]).toEqual([true,[],[]]);
});
it('D10: mostly withheld warns and still passes',()=>{const r=runDisclosure(mostlyWithheld());expect([r.passed,r.warnings]).toEqual([true,['mostly_withheld']]);});
it('A13: an owner source-document id in the text blocks with private_reference',()=>{
 const id='5b3f6c1e-5d0a-4f43-9a55-1d3f0c2b9a10';
 const r=runDisclosure(withNote(cleanInput({privateIds:new Set([id])}),`见 ${id}`));
 expect(r.blocked).toEqual(expect.arrayContaining(['private_reference','identifier_in_text']));
});
it('A8: an unsupported broker ref blocks with kind_unsupported',()=>{ /* snapshot evidence state unsupported */ });
it('stores no owner text in the receipt detail, only codes, fields and counts',()=>{
 const r=runDisclosure(withNote(cleanInput(),'失业率为 4.3%'));expect(JSON.stringify(r.checks)).not.toContain('失业率');
});
```

- [ ] **Steps 2–5:** run (fail) → implement → run (pass) → commit (`feat(topics): deterministic disclosure check`).

### Task T6.4: disclosure-check and preview routes

**Files:** Create `src/lib/topics/publish.ts` (first half), `src/app/api/admin/topics/[id]/disclosure-check/route.ts`, `src/app/api/admin/topics/[id]/preview/route.ts`; extend `admin-routes.test.ts`

```ts
export async function checkDraft(d:AdminDeps,i:{topicId:string;actor:string}):Promise<{receipt_id:string;passed:boolean;checks:DisclosureCheck[];blocked:string[];warnings:string[]}>;
export async function previewDraft(d:AdminDeps,i:{topicId:string}):Promise<{dossier:DossierDto;difference:{ordinal:number;label:Bilingual;public:{state:ResolveState;text:string|null};admin:{text:string|null}}[];masked:number}>;
```

`checkDraft`: load topic + draft → `assemble` (`cutoff = now`) → `runDisclosure` with `privateIds = await d.privateIds(actor)` → `db.recordDisclosure` (`codeVersion ?? 'unknown'`) → result. `previewDraft`: `assemble`, then build the same `DossierDto` the public page uses from the assembled snapshot (`view:'current'`, no drift) and the difference table for `maskedInPublic`; it writes no version, only one audit row through `db.recordEvent({action:'preview', detail:{draft_hash, masked: maskedInPublic.length}})`.

- [ ] **Step 1: Failing test**: `POST …/disclosure-check` on a clean fixture draft → 200 `passed:true` and a stored receipt whose `draft_hash` equals the draft's; on a draft with a dangling slot → 200 `passed:false`, `blocked:['dangling_slot']`; `GET …/preview` → 200 with `difference` listing the CN fact ordinal and a JSON `dossier` that does not contain the CN value, and `versionsOfTopic` still empty.
- [ ] **Steps 2–5:** run (fail) → implement → run (pass) → commit (`feat(topics): disclosure-check and preview routes`).

### Task T6.5: publish and unpublish

**Files:** Modify `src/lib/topics/publish.ts`; Create `src/app/api/admin/topics/[id]/publish/route.ts`, `…/unpublish/route.ts`, `src/lib/topics/publish.test.ts`

```ts
export async function publishTopic(d:AdminDeps,i:{topicId:string;expectedDraftHash:string;actor:string}):Promise<{version_id:string;version_no:number;evidence:number;counts:EvidenceCounts}>;
export async function unpublishTopic(d:AdminDeps,i:{topicId:string;reason:UnpublishReason;note:string|null;actor:string}):Promise<{current_version_no:number|null}>;
```

`publishTopic`: draft hash differs from `expectedDraftHash` → `publish_blocked:draft_changed`; `latestReceipt(topicId, draftHash)` missing or not passed → `publish_blocked:disclosure_required`; `assemble` at `cutoff = now`; `degraded` → `resolver_degraded`; `runDisclosure` again on this assembly (resolver state may have changed since the receipt) → blocked → `publish_blocked:<codes joined by ','>`; approved summary for this draft hash (PR-9; null before) → `db.publish(…)`; a `TopicsDbError` is rethrown as `TopicError` with the same code. Nothing is written on any failure (single SQL function).

- [ ] **Step 1: Failing test** (memory db + memory resolver): happy path writes v1 with `evidence` equal to the draft count; each blocking path above returns its code and leaves `versionsOfTopic` empty; a second publish after a draft edit writes v2 with `supersedes_version_id` = v1; unpublish v2 returns `{current_version_no:1}`; routes: `POST …/publish` 200 / 409 with `error.code` starting `publish_blocked:`; `POST …/unpublish` with `reason:'other'` → 400 `invalid_body:reason`.
- [ ] **Steps 2–5:** run (fail) → implement → run (pass) → commit (`feat(topics): publish and unpublish`).

### Task T6.6: retire and the public switch with the licence gate

**Files:** Create `src/lib/topics/settings.ts`, `src/lib/topics/settings.test.ts`, `src/app/api/admin/topics/[id]/retire/route.ts`, `src/app/api/admin/topics/settings/route.ts`

`POST …/retire` body `{reason, note?}` → `db.retire`. `POST /api/admin/topics/settings` body `{public_enabled:boolean, summary_public_enabled:boolean, summary_provider_note:string|null, licence_confirmations:Record<string,{terms_url:string, confirmed_on:'YYYY-MM-DD'}>}` → `setPublicEnabled(d, body, actor)`: validates `terms_url` https and the date shape, `summary_public_enabled` requires a non-empty note, then `db.setPublicEnabled`; `licence_confirmation_missing` → 409 with `meta.missing` = the attribution keys still unconfirmed (computed in TypeScript from the current versions' `ok` evidence drawers, the same rule as the SQL function). `GET` returns the settings row plus `required_attributions`.

- [ ] **Step 1: Failing test**: opening with no confirmations while a published version uses `macro:attribution` → 409 `licence_confirmation_missing`, `meta.missing:['macro:attribution']`; with the confirmation → `public_enabled:true` and an audit row `settings_change` whose detail holds the confirmation; closing needs no confirmations; `summary_public_enabled:true` without a note → 400 `invalid_body:summary_provider_note`; retire then create with the same slug → 409 `slug_taken` (A18).
- [ ] **Steps 2–5:** run (fail) → implement → run (pass) → commit (`feat(topics): retire and the licence-gated public switch`).

### Task T6.7: exit-criteria scenario

**Files:** Create `src/lib/topics/scenario.test.ts`

One end-to-end test over `memoryTopicsDb` + `memoryResolver(allFixtures())` + the services (no HTTP), following spec §1.1 "成功标准":

```ts
it('v1 stays byte-identical after a revision is injected; asOf before v1 is 404; the CN value never leaves',async()=>{
 const {deps,pub,sources,topicId,slug}=await scenario();          // draft: ev1 macro unrateV1, ev2 US fact, ev3 CN fact, ev4 public citation, one expected slot industry_not_published
 await checkDraft(deps,{topicId,actor});const v1=await publishTopic(deps,{topicId,expectedDraftHash:await hashOf(deps,topicId),actor});
 const before=JSON.stringify(await readTopic(pub(),slug,{version:1}));
 sources.seed.macro.rows.push(revisionOf(sources,OBS.unrateV1,OBS.unrateV2,'4.2'));
 expect(JSON.stringify(await readTopic(pub(),slug,{version:1}))).toBe(before);
 expect(before).toContain('"4.3"');expect(before).not.toContain('987654321.12');
 const d=await readTopic(pub(),slug,{});
 expect(d.evidence.find(e=>e.ordinal===3)).toMatchObject({state:'withheld',fact:null});
 expect(d.expected_slots[0].reason_code).toBe('industry_not_published');
 await expect(readTopic(pub(),slug,{asOf:dayBefore(v1)})).rejects.toMatchObject({code:'no_version_at_asof',status:404});
});
```

- [ ] **Steps 1–5:** write → run (fails until the helpers exist) → add `scenario()` helpers in `src/lib/topics/fixtures/scenario.ts` → run (pass) → commit (`test(topics): exit-criteria scenario`).

### Task T6.8: publish page (`TopicPublish`)

**Files:** Create `src/app/(app)/admin/topics/[id]/publish/page.tsx`, `src/components/topics/admin/publish/{PublishClient.tsx,DisclosureTable.tsx,PreviewBlock.tsx,PublishDialog.tsx,UnpublishDialog.tsx,RetireDialog.tsx,VersionsTable.tsx,publish-model.ts,publish-model.test.ts}`; Modify `FlowBar.tsx` (enable the links), `messages/{zh,en}/topicsAdmin.json`; Create `src/app/api/admin/topics/[id]/versions/route.ts` (GET: versions with counts and drift counts)

Blocks, as on the artboard: **披露检查** table (`#`, 检查项, 结果 chip 通过 / 警告 / 阻断, 说明 with mono code and a link back to the editor field for checks 4, 5, 7), header chip `topic-disclosure/1` and totals `阻断 n · 警告 n · 通过 n`, note "阻断项未清零时，“发布”按钮保持不可用并写明还差几项。每次检查写一条回执。"; **摘要** block placeholder card "摘要功能尚未启用" until PR-9; **预览** (chip 预览 · 未发布; when the assembly is degraded, a blocking note "解析器故障占比过高，暂不能发布" with code `resolver_degraded` replaces the table, spec §5.2; otherwise difference table 证据 / 公开视图 / 管理员视图, "公开视图被遮蔽的值：n 个", link to open the full preview, which is the dossier components fed by `previewDraft().dossier` under the banner); **发布确认** dialog ("发布 {title} 为 v{n}？", 将冻结的证据, 状态分布, 预期槽, 摘要 不附带 / 附带, "发布后内容不可改；修改只能出新版本。"); **取消发布** dialog (reason category select with the four categories, 内部说明（不公开）, "读者看到版本号与原因类别，看不到内容。"); **退役** dialog (reason category select per X11, note, "输入 slug 确认" enabling the button only on an exact match); **版本管理** table (版本, 发布, 状态 当前 / 被取代 / 已取消发布, 漂移, 回放核验, action: 核验 and 详情 are added in PR-7 and render disabled here). `src/components/ui` has no dialog primitive (`Button`, `Card`, `Metric`, `Panel`, `Tag` only): dialogs use the native `<dialog>` element opened with `showModal()` (focus containment and Escape are built in), styled with tokens, with focus returned to the opener on close.

- [ ] **Step 1: Failing test**: `publishModel({receipt, versions, draft})` → `canPublish` false with `remaining` = number of blocking checks, true only when the latest receipt passed for the current `draft_hash`; totals; the dialog summary (`evidence`, state distribution in `COUNT_ORDER`, slots, summary attached or not); `retireEnabled(input, slug)` true only on exact equality; version rows' status keys.
- [ ] **Steps 2–5:** run (fail) → implement → run (pass) → commit (`feat(topics): publish page with check, preview and dialogs`).

**PR-6 gate:** `npm test`, PG gate, `npm run build`; fixture-mode walk: edit → save → check → preview → publish → unpublish, compared with `TopicPublish`.

---

## PR-7: drift, replay verification, chain step 05, hub entry (branch `claude/topics-pr7-jobs-entry`, after PR-4 and PR-6)

### Task T7.1: drift check

**Files:** Create `src/lib/topics/drift.ts`, `src/lib/topics/drift.test.ts`, `src/app/api/cron/topic-drift/route.ts`, `src/app/api/cron/topic-drift/route.test.ts`; Modify `src/lib/topics/scenario.test.ts`, `src/components/topics/admin/publish/VersionsTable.tsx` (drift detail table), `src/lib/topics/deps.ts` (`cronDeps()`)

```ts
export function driftOf(frozen:{ref:EvidenceRef;state:ResolveState;value_text:string|null},latest:LatestIdentity|null):Pick<DriftRow,'drift'|'current_identity'>;
export const DRIFT_BATCH=500;
export async function runDrift(d:{db:Pick<TopicsDb,'liveEvidence'|'versionsOfTopic'|'upsertDrift'|'settings'>;resolver:Resolver;now():Date},o:{deadlineMs:number}):
 Promise<{checked:number;complete:boolean;counts:Record<Drift,number>}>;
```

`driftOf`, in order: frozen `state!=='ok'` → `unchanged`; `latest===null` → `unverifiable`; `latest.state==='retracted'` → `retracted`; `'withheld'` → `now_withheld`; `'missing'` → `unverifiable`; `latest.object_id!==frozen.ref.id` and `latest.value` and `latest.value.value_text!==frozen.value_text` → `revised` with `current_identity = latest.value`; `latest.newer_period` → `newer_period` with `current_identity = {value_text:null, unit:null, period:latest.newer_period, available_at:null}`; else `unchanged`. `current_identity` is null for every other drift, so a restricted value can never reach the drift table.

`runDrift`: start from `settings().drift_cursor` (null = beginning); loop `liveEvidence(cursor, DRIFT_BATCH)`; the frozen `value_text` comes from the version snapshot (`evidence[ordinal].resolved.display.fact.slots.value`), cached per version; a `latestIdentity` that throws counts as `unverifiable`; `upsertDrift(rows, now, complete, nextCursor)` once per batch; stop when a batch is short (`complete=true`, cursor cleared, `drift_checked_at` stamped) or `now` passes the deadline (`complete=false`, cursor stored; the next run resumes there). It never touches `topic_versions`.

Route: `dynamic='force-dynamic'`, `maxDuration=300`, `GET` and `POST` → `run()`: `CRON_SECRET` missing → 503 `cron_unavailable`; `authorizedCronRequest` false → 401; `!topicsEnabled()` → 200 `{skipped:'disabled'}`; `resolveCodeVersion({allowGit:false})` null → 503 `code_version_unavailable`; else `runDrift(cronDeps(), {deadlineMs: 250_000})` → 200 `{checked, complete, counts}`; a thrown error → 500 through `failureResponse` (the previous drift rows stay; `drift_checked_at` is not advanced, so the page's "漂移检查截至" stays truthful, spec §5.2).

- [ ] **Step 1: Failing tests**

```ts
// drift.test.ts
const frozen={ref:{v:1 as const,kind:'macro_observation' as const,id:'a',as_of:'2026-11-01T00:00:00.000Z'},state:'ok' as const,value_text:'4.3'};
const val=(v:string)=>({value_text:v,unit:'pct',period:'2026-08',available_at:'2026-10-03T12:30:00.000Z'});
it.each([
 ['nothing to drift for a non-ok item',{...frozen,state:'withheld' as const},{state:'ok',object_id:'b',value:val('9'),newer_period:null,reason:null},'unchanged',null],
 ['no resolver answer',frozen,null,'unverifiable',null],
 ['retracted at source',frozen,{state:'retracted',object_id:'a',value:null,newer_period:null,reason:'quarantined'},'retracted',null],
 ['no longer public',frozen,{state:'withheld',object_id:'a',value:null,newer_period:null,reason:'catalog_restricted'},'now_withheld',null],
 ['a new object with a different value',frozen,{state:'ok',object_id:'b',value:val('4.2'),newer_period:null,reason:null},'revised',val('4.2')],
 ['a new object with the same value',frozen,{state:'ok',object_id:'b',value:val('4.3'),newer_period:null,reason:null},'unchanged',null],
 ['a later period exists',frozen,{state:'ok',object_id:'a',value:val('4.3'),newer_period:'2026-09-30',reason:null},'newer_period',{value_text:null,unit:null,period:'2026-09-30',available_at:null}],
 ['revision outranks newer period',frozen,{state:'ok',object_id:'b',value:val('4.2'),newer_period:'2026-09-30',reason:null},'revised',val('4.2')],
] as const)('%s',(_n,f,latest,drift,current)=>{expect(driftOf(f,latest)).toEqual({drift,current_identity:current});});
it('resumes from the stored cursor and stamps the check time only when complete',async()=>{
 const f=driftFixture(1200);   // three versions, 1200 evidence rows
 const first=await runDrift({...f.deps,now:clock(['2026-11-12T06:30:00Z','2026-11-12T06:30:01Z','2026-11-12T06:40:00Z'])},{deadlineMs:60_000});
 expect([first.complete,first.checked]).toEqual([false,500]);expect((await f.db.settings()).drift_checked_at).toBeNull();
 const second=await runDrift(f.deps,{deadlineMs:250_000});
 expect([second.complete,second.checked]).toEqual([true,700]);expect((await f.db.settings()).drift_checked_at).not.toBeNull();
});
it('skips unpublished versions',async()=>{ /* an unpublished version's rows are never passed to latestIdentity */ });
```

`scenario.test.ts` gains (A4): after the injected revision, `runDrift` → `readTopic(pub(), slug, {})` shows ordinal 1 with `drift:'revised'`, `current.value_text:'4.2'` and the frozen fact still `'4.3'`; `readEvidence(pub(), slug, 1)` maps through `topicDrawerInput` to the `revised` variant with both values. And (A15): with `runDrift` made to throw, the previous rows and `drift_checked_at` are unchanged; with the clock 73 hours later `readTopic(...).drift_unchecked` is true.

`route.test.ts`: no secret → 503; bad bearer → 401; flag off → `{skipped:'disabled'}` and `runDrift` not called; success shape.

- [ ] **Steps 2–5:** run (fail) → implement → run (pass) → commit (`feat(topics): daily drift check`).

### Task T7.2: replay verification

**Files:** Create `src/lib/topics/verify.ts`, `src/lib/topics/verify.test.ts`, `src/app/api/admin/topics/[id]/versions/[n]/verify/route.ts`; Modify `VersionsTable.tsx` (核验 button, result chip, mismatch note)

```ts
export interface VerifyResult{version_no:number;matched:number;skipped:number;mismatched:{ordinal:number;reason:'digest_changed'|'state_changed'|'snapshot_hash'}[]}
export async function verifyVersion(d:{db:TopicsDb;resolver:Resolver;tables:TableClient;now():Date},i:{topicId:string;versionNo:number;actor:string}):Promise<VerifyResult>;
```

Steps: load the version; `sha256Hex(snapshot_text) !== snapshot_hash` → one mismatch `{ordinal:0, reason:'snapshot_hash'}`; resolve every snapshot evidence ref at its own `as_of`, public audience; skip (count in `skipped`) items whose current drift is `retracted` or `now_withheld` and items frozen non-ok; compare `state` then `digest`. On any mismatch: `startBatch(tables, {dataset:'topics.replay', …})`, one `quarantine(tables, {dataset:'topics.replay', table:'topic_versions', naturalKey:`${version_id}:${ordinal}`, reasonCode:'replay_mismatch', detail:{reason}, batchId})` per mismatch, `finishBatch`. Always `db.recordEvent({topicId, actor, action:'replay_verify', detail:{version_no, matched, skipped, mismatched}})`. The snapshot is never modified. UI: chip `一致 · {time}` or `不一致 · n 条`, and the artboard's note "v{n} 回放核验不一致 … 冻结快照保持不变；需人工判断是否取消发布。".

- [ ] **Step 1: Failing test** (A7): the scenario's v1 verifies with `mismatched:[]`; with a resolver wrapper that changes one template name (a formatting change) → `mismatched:[{ordinal:1,reason:'digest_changed'}]`, one open `dq_quarantine` row with `dataset:'topics.replay'` in the memory table client, and an audit row `replay_verify`; a retracted-drift item is skipped, not mismatched; the version's `snapshot_hash` is unchanged after both runs.
- [ ] **Steps 2–5:** run (fail) → implement → run (pass) → commit (`feat(topics): replay verification`).

### Task T7.3: weekly verification sample

**Files:** Create `src/app/api/cron/topic-verify/route.ts`, `…/route.test.ts`

Same guard sequence as T7.1. Picks up to 20 live versions with a seeded shuffle (seed = ISO week string, so a rerun in the same week checks the same set), calls `verifyVersion` with the system actor `00000000-0000-0000-0000-000000000000`, returns `{verified, mismatched_versions}`; internal deadline 250 s.

- [ ] **Step 1: Failing test**: guards; 25 live versions → exactly 20 verified, the same 20 on a second call in the same week; flag off → skipped.
- [ ] **Steps 2–5:** run (fail) → implement → run (pass) → commit (`feat(topics): weekly replay verification sample`).

### Task T7.4: chain step 05

**Files:** Create `src/lib/topics/public-flag.ts`, `src/lib/topics/public-flag.test.ts`; Modify `src/app/(app)/layout.tsx`

```ts
// src/lib/topics/public-flag.ts
import 'server-only';
import {unstable_cache} from 'next/cache';
import {getAdminSupabase} from '@/lib/supabase/admin';
import {supabaseTopicsDb} from './db';
import {topicsEnabled} from './flags';
export function createTopicsPublicEnabledReader(enabled:()=>boolean,configured:()=>boolean,read:()=>Promise<{public_enabled:boolean}|null>):()=>Promise<boolean>{
 return async()=>{try{return enabled()&&configured()&&(await read())?.public_enabled===true;}catch{return false;}};
}
const cachedRead=unstable_cache(createTopicsPublicEnabledReader(()=>topicsEnabled(),
 ()=>Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY),
 ()=>supabaseTopicsDb({admin:getAdminSupabase()}).settings()),['topics-public-enabled'],{revalidate:60});
export async function readTopicsPublicEnabled():Promise<boolean>{try{return await cachedRead();}catch{return false;}}
```

Layout, inside new fences next to the foreign ones:

```tsx
// TOPICS ↓ chain step 05 follows the env flag and the cached public switch (X27)
import {readTopicsPublicEnabled} from '@/lib/topics/public-flag';
// TOPICS ↑
…
  // TOPICS ↓
  const availability = {...DEFAULT_CHAIN_AVAILABILITY, foreign: await readForeignPublicEnabled(), topic: await readTopicsPublicEnabled()};
  // TOPICS ↑
```

(The existing foreign line is replaced by this one; keep the `// FOREIGN` fences around its import.)

- [ ] **Step 1: Failing test**: the reader is false when the env flag is off (and `read` is not called), false when unconfigured, false when `read` throws or returns `{public_enabled:false}`, true only when all three hold; a source assertion that `layout.tsx` contains `topic: await readTopicsPublicEnabled()` inside the `// TOPICS ↓` … `// TOPICS ↑` fence. Run also `npm test -- src/components/research-ui/chain.test.ts` (unchanged, still green).
- [ ] **Steps 2–5:** run (fail) → implement → run (pass) → commit (`feat(topics): chain step 05 availability`).

### Task T7.5: `/intel` entry card

**Files:** Create `src/components/topics/TopicEntryCard.tsx`, `src/components/topics/entry-card-model.ts`, `…/entry-card-model.test.ts`; Modify `src/app/(app)/intel/page.tsx`

Client component; fetches `/api/topics?limit=200` once; on any non-200 renders nothing (flag off, switch off, signed out). Content per the `Hub` artboard card 05, in the page's current card style (`card-base block hover:bg-bg-elevated`, `data-testid="intel-topics-card"`): title `05 专题研究 Topics`; rows 已发布专题 `{n}` (`200+` when the page is full), 最近发布 `{title} · v{n}`, 发布后有修订 `{n} 个专题`; bottom link 进入专题目录 → `/intel/topics`. Mounted in `ResearchTab` after the companies card:

```tsx
{/* TOPICS ↓ */}
<TopicEntryCard />
{/* TOPICS ↑ */}
```

with the import inside `// TOPICS ↓` … `// TOPICS ↑` at the top of the file. Messages under `topics.entry.*`.

- [ ] **Step 1: Failing test**: `entryCardModel(items, locale)` → counts, latest title in the locale, revised-topic count; `null` for an empty list; source assertion on the two fences in `intel/page.tsx`.
- [ ] **Steps 2–5:** run (fail) → implement → run (pass) → commit (`feat(topics): research hub entry card`).

**PR-7 gate:** `npm test`, `npm run build`, PG gate.

---

## PR-8: Playwright, runbook, acceptance (branch `claude/topics-pr8-e2e-runbook`, after PR-7)

### Task T8.1: Playwright fixture spec

**Files:** Create `e2e/topics.spec.ts`

```ts
// Topic research pages (spec §13.2 e2e). Fixture mode only, no Supabase env:
//   TOPICS_E2E_FIXTURES=1 npx playwright test e2e/topics.spec.ts
import {expect,test} from '@playwright/test';
test.skip(process.env.TOPICS_E2E_FIXTURES!=='1','fixture mode only (TOPICS_E2E_FIXTURES=1, no Supabase env)');
test.use({locale:'zh-CN'});

test('directory → dossier → drawer → replay',async({page})=>{
 await page.goto('/intel/topics');
 await expect(page.getByRole('heading',{level:1})).toContainText('专题研究');
 await expect(page.locator('[data-chain-state="current"]')).toContainText('05');
 await page.getByRole('button',{name:'宏观'}).click();
 await page.getByRole('link',{name:/利率/}).first().click();
 await expect(page).toHaveURL(/\/intel\/topics\/rates-and-banks$/);
 await expect(page.getByText('v2 · 当前')).toBeVisible();
 await page.getByRole('button',{name:'3.75%'}).first().click();
 const drawer=page.getByRole('dialog');
 await expect(drawer).toContainText('身份');await expect(drawer).toContainText('许可');
 await page.keyboard.press('Escape');await expect(drawer).toBeHidden();
 await page.getByLabel('回放 截至').fill('2026-11-01');
 await expect(page.getByText('回放视图 · 截至 2026-11-01')).toBeVisible();
 await expect(page.getByText('v1')).toBeVisible();
});
test('withheld evidence shows a state and no number',async({page})=>{
 await page.goto('/intel/topics/cn-company');
 const row=page.locator('[data-evidence-ordinal="5"]');
 await expect(row.locator('[data-research-state="withheld"]')).toBeVisible();
 await expect(row).not.toContainText(/\d{3,}/);
});
test('chart has a table equivalent',async({page})=>{
 await page.goto('/intel/topics/rates-and-banks');
 await page.getByRole('button',{name:'表格'}).first().click();
 await expect(page.getByRole('table').first()).toBeVisible();
});
test('admin: create → check → preview → publish → unpublish',async({page})=>{
 await page.goto('/admin/topics/new');
 await page.getByLabel('slug').fill('e2e-topic');await page.getByLabel('标题（中文）').fill('端到端专题');await page.getByLabel('Title (English)').fill('E2E topic');
 await page.getByRole('button',{name:'创建'}).click();
 await expect(page).toHaveURL(/\/admin\/topics\/[0-9a-f-]{36}$/);
 await page.getByRole('button',{name:'新增分节'}).click();
 await page.getByLabel('序列 id').fill('US_UNRATE');await page.getByLabel('数据期').fill('2026-08-31');await page.getByRole('button',{name:'查找'}).click();
 await page.getByRole('button',{name:'加入'}).first().click();
 await page.getByRole('button',{name:'保存草稿'}).click();
 await page.getByRole('link',{name:'运行披露检查'}).click();
 await page.getByRole('button',{name:'运行披露检查'}).click();
 await expect(page.getByText(/阻断 0/)).toBeVisible();
 await page.getByRole('button',{name:/^发布 v1$/}).click();await page.getByRole('dialog').getByRole('button',{name:'发布 v1'}).click();
 await expect(page.getByText('当前')).toBeVisible();
 await page.getByRole('button',{name:'取消发布'}).click();
 await page.getByRole('dialog').getByLabel('原因类别（读者可见）').selectOption('error');
 await page.getByRole('dialog').getByRole('button',{name:'取消发布 v1'}).click();
 await expect(page.getByText('已取消发布')).toBeVisible();
});
test('English locale',async({page,context})=>{
 await context.addCookies([{name:'NEXT_LOCALE',value:'en',url:'http://localhost:3000'}]);
 await page.goto('/intel/topics');await expect(page.getByRole('heading',{level:1})).toContainText('Topic research');
});
test.describe('phone',()=>{
 test.use({viewport:{width:390,height:844}});
 test('dossier stacks and the drawer is full screen',async({page})=>{
  await page.goto('/intel/topics/rates-and-banks');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.getByRole('button',{name:'来源'}).first().click();
  const box=await page.getByRole('dialog').boundingBox();expect(box?.width).toBeGreaterThanOrEqual(388);
 });
});
```

- [ ] **Step 1:** write the spec. **Step 2:** run `TOPICS_E2E_FIXTURES=1 npx playwright test e2e/topics.spec.ts` with no `.env*` in the checkout · Expected: 7 passed. Fix selectors in the components (add `data-evidence-ordinal`, labels) rather than loosening the assertions. **Step 3:** `npx playwright test e2e/topics.spec.ts` without the variable · Expected: 7 skipped. **Step 4:** commit (`test(topics): Playwright fixture spec`).

### Task T8.2: runbook and acceptance record

**Files:** Create `docs/runbooks/topic-research.md`, `docs/audits/2026-11-16-topic-research/acceptance.md`

Runbook sections: (1) flags and switches (`TOPICS_ENABLED`, `topic_settings.public_enabled`, `summary_public_enabled`, per-source licences; what each one closes); (2) first enable, owner only: apply migrations, lock PR, set the env flag, publish a first topic as admin, `POST /api/admin/topics/settings` with the confirmation body (a filled example for `macro:attribution` and `facts:sec`), emergency off (`public_enabled:false`, or unpublish); (3) registering the crons (the two `vercel.json` entries: `{"path":"/api/cron/topic-drift","schedule":"30 6 * * *"}`, `{"path":"/api/cron/topic-verify","schedule":"0 7 * * 0"}`); (4) drift states and what to do for each; (5) replay mismatch handling (`dq_quarantine` dataset `topics.replay`); (6) unpublish / retire; (7) error codes table (§13.1); (8) what cannot be done from here (purge, spec Q5).

`acceptance.md`: one row per A1–A18 and per exit criterion with the test file and test name that proves it, the command, and the observed result on the PR-8 branch; a capability-matrix table (spec §9, column T0) with the fixture or test proving each cell; a list of what was not verifiable locally (section 9 of this plan).

- [ ] **Step 1:** write both. **Step 2:** run the full gates once more (`npm test`, both PG commands, `npm run build`, the Playwright fixture spec) and paste the summaries into `acceptance.md`. **Step 3:** commit (`docs(topics): runbook and acceptance record`).

---

## PR-9: model summary (branch `claude/topics-pr9-summary`, after PR-6; spec T1)

Precondition: the commander confirms no macro branch is open on `src/lib/macro/strategy/{explain-validate,explain-render,explain-request,contract}.ts` (spec Q4).

### Task T9.1: generalise the validator

**Files:** Modify `src/lib/macro/strategy/explain-validate.ts`; Create `src/lib/topics/summary/validate.ts`, `src/lib/topics/summary/validate.test.ts`

```ts
// explain-validate.ts (added; existing exports keep their signatures and behaviour)
export interface ValidationPolicy{forbidden:readonly string[];regime:readonly string[];advice:readonly string[];singleSentence:boolean}
export const MACRO_POLICY:ValidationPolicy={forbidden:FORBIDDEN_TERMS,regime:REGIME_TERMS,advice:[],singleSentence:false};
export type PolicyFailureCode=FailureCode|'multi_sentence';
export function validateHypotheses(raw:unknown,factIds:ReadonlySet<string>,policy:ValidationPolicy):
 {ok:true;output:ModelOutput;failures:[]}|{ok:false;codes:PolicyFailureCode[];failures:{code:PolicyFailureCode;section:'output'|'points'|'counterpoints';index:number|null;match:string|null;detail?:'advice'}[]};
export const validateExplanation=(raw:unknown,factIds:ReadonlySet<string>):ValidationResult=>validateHypotheses(raw,factIds,MACRO_POLICY) as ValidationResult;
```

Advice hits are reported with code `forbidden_term` and `detail:'advice'` (spec A9). `multi_sentence`: NFKC, split on `。！？.!?；;`, more than one non-empty part → fail. `src/lib/topics/summary/validate.ts`: `TOPIC_VALIDATOR_VERSION='topic-summary-validator/1'`, `TOPIC_POLICY={forbidden:FORBIDDEN_TERMS, regime:REGIME_TERMS, advice:ADVICE_TERMS (from ../lexical), singleSentence:true}`, `validateTopicSummary(raw, factIds)`.

- [ ] **Step 1: Failing test** (A9 and the spec's validator fixture)

```ts
const ids=new Set(['ev:1','ev:2']);
const out=(hypothesis:string)=>({points:[{fact_ids:['ev:1'],hypothesis}],counterpoints:[]});
it.each([['利率上升 3 个基点可能压缩息差','numeral',undefined],['未来三个月可能继续','numeral',undefined],['规模可能达到两倍','numeral',undefined],['适合 buy 银行股','forbidden_term','advice'],
 ['推荐关注银行','forbidden_term','advice'],['经济进入衰退阶段','regime_term',undefined],['十倍空间','numeral',undefined],['We recommend banks','forbidden_term','advice']] as const)('%s → %s',(text,code,detail)=>{
 const r=validateTopicSummary(out(text),ids);expect(r.ok).toBe(false);
 if(!r.ok)expect(r.failures).toContainEqual(expect.objectContaining({code,...(detail?{detail}:{})}));
});
it('rejects two sentences in one point',()=>{const r=validateTopicSummary(out('息差可能收窄。存款成本可能上升。'),ids);expect(!r.ok&&r.codes).toEqual(['multi_sentence']);});
it('accepts one numberless sentence that cites known facts',()=>{expect(validateTopicSummary(out('政策利率维持高位可能压缩银行净息差'),ids).ok).toBe(true);});
it('rejects an unknown fact id',()=>{expect(validateTopicSummary({points:[{fact_ids:['ev:9'],hypothesis:'息差可能收窄'}],counterpoints:[]},ids)).toMatchObject({ok:false,codes:['unknown_fact']});});
```

- [ ] **Step 2: Run** · Expected: FAIL, module not found. **Step 3:** implement. **Step 4 (A10):** `npm test -- src/lib/macro/strategy/explain-validate.test.ts src/lib/macro/strategy/forbidden-terms.test.ts src/lib/topics/summary/validate.test.ts src/lib/topics/vocabulary-scan.test.ts` · Expected: PASS with the macro test files unmodified (`git diff --stat origin/main -- 'src/lib/macro/**/*.test.ts'` prints nothing). **Step 5:** commit (`refactor(macro): policy-driven hypothesis validator; feat(topics): summary policy`).

### Task T9.2: templates and topic facts

**Files:** Modify `src/lib/macro/strategy/explain-render.ts` (export a registry merge), `src/lib/macro/strategy/contract.ts` (`Fact.evidence?: EvidenceRef[]`, type-only import); Create `src/lib/topics/summary/templates.ts`, `src/lib/topics/summary/facts.ts`, `…/templates.test.ts`, `…/facts.test.ts`

`explain-render.ts`: add `export function registerTemplates(ns:string, t:Record<string,Record<Locale,Renderer>>):void` (throws on a duplicate id or an id not starting with `${ns}.`), export the `Renderer` type, and let `NameLookup` accept any id → `Bilingual|null` (unchanged signature; topics pass a lookup over frozen labels). `TEMPLATES` keeps its 18 macro keys untouched.

`templates.ts` registers, zh and en each: `topic.macro_level` ("{period} {name}为 {value}" / "{name} was {value} in {period}"), `topic.macro_change` (reuses the macro `change` wording), `topic.fact_value` ("{company} {period} {concept}为 {value}"), `topic.industry_value` ("{period} {industry} {metric}为 {value}（{n_with_data}/{n_members} 家有数据）", with "（重建口径）" appended when the fact carries `basis:'reconstruction'`), `topic.citation` ("见《{title}》第 {page} 页"; never renders snippet text), `topic.judgment_ref` ("见 F4 判断卡 {method}"; no number).

`facts.ts`:

```ts
export interface TopicFact extends Fact{evidence:EvidenceRef[];refs:number[]}
export function topicFacts(snapshot:Pick<TopicSnapshot,'evidence'>):{facts:TopicFact[];incomparable:{a:number;b:number}[]};
```

Rules: one `ev:<ordinal>` fact per evidence item with `state==='ok'` and `kind!=='judgment'` (judgments, non-ok items, owner text and excerpts never enter the model input); for each pair of `macro_observation` items of the same series in ordinal order, `typedChange(changeKind, from, to)`: same unit and both `ok` → fact `pair:<a>:<b>` with template `topic.macro_change`; different unit or `typedChange` null → no fact, push `{a,b}` to `incomparable`.

- [ ] **Step 1: Failing tests**: every `topic.*` id has zh and en renderers and is rendered by at least one fixture (registry completeness); rendered `topic.citation` contains no digit from the snippet; `topicFacts` over the scenario snapshot yields `ev:1`, `ev:2`, `ev:4` (not the withheld `ev:3`, not a judgment), one `pair` fact for two same-series observations, and `incomparable` for a `pct` vs `bp` pair; `registerTemplates('topic', {'level': …})` throws.
- [ ] **Step 4 (A10):** `npm test -- src/lib/macro/strategy` unchanged and green. **Step 5:** commit (`feat(topics): summary templates and frozen fact list`).

### Task T9.3: extract the request skeleton

**Files:** Create `src/lib/macro/strategy/validated-run.ts`, `…/validated-run.test.ts`; Modify `src/lib/macro/strategy/explain-request.ts`

```ts
export interface ValidatedRunStore<Claim>{
 replay(actor:string,requestId:string,payloadHash:string):Promise<{kind:'none'}|{kind:'conflict'}|{kind:'replay';response:unknown}>;
 claim(actor:string,requestId:string,payloadHash:string):Promise<Claim>;
 recordCompletion(claim:Claim,rawOutput:unknown,finalizePayload:Record<string,unknown>):Promise<void>;
 finish(claim:Claim,r:{state:'accepted'|'rejected'|'failed';provider:string;model:string;rawOutput:unknown;validation:unknown;rendered:unknown;failureCodes:string[];accounting:unknown;finalizePayload:Record<string,unknown>}):Promise<unknown>;
 markFinalized(claim:Claim):Promise<void>;
 auditKey(claim:Claim):string;
}
export interface ValidatedRunSubject{system:string;user:string;validate(raw:unknown):{ok:true;output:unknown}|{ok:false;codes:string[];failures:unknown};render(output:unknown):unknown;usageMeta:Record<string,unknown>}
export async function runValidatedExplanation<Claim>(d:{store:ValidatedRunStore<Claim>;llm:LlmDeps;now():Date},a:{actor:string;requestId:string;payloadHash:string;subject:ValidatedRunSubject}):
 Promise<{status:number;body:unknown}>;
```

The function body is the middle of today's `handleExplainRequest` (replay → quota → claim → `begin` → `call` → record completion → validate → finish → `finalize` in `finally` → mark finalized), moved without reordering; `handleExplainRequest` keeps body validation, subject loading and manifest building, then delegates with a `ValidatedRunStore` adapter over `StrategyDb`.

- [ ] **Step 1: Failing test** for the skeleton with a fake store and fake `LlmDeps`: order of calls on the happy path; a validator rejection finishes `rejected` and still finalises usage; a provider error finishes `failed` with `provider_error`; a replay with the same payload returns the stored response without calling the model; a different payload → 409 `payload_conflict`; quota refusal → 429 before any claim.
- [ ] **Step 4 (A10):** `npm test -- src/lib/macro/strategy/explain-request.test.ts src/lib/macro/strategy/strategy.integration.test.ts` (the second under the PG gate) · Expected: PASS with both files unmodified. **Step 5:** commit (`refactor(macro): extract the validated-run skeleton`).

### Task T9.4: summary storage

**Files:** Create `supabase/migrations/20261210092000_topics_summary_functions.sql`, `src/lib/topics/summary/db.ts`; Modify `src/lib/topics/types.ts` (port), the three adapters, `db-contract.ts`, `topics.integration.test.ts`

Functions (same idiom as T1.2), mirroring the macro five by meaning:

| Function | Parameters | Rules |
|---|---|---|
| `topic_claim_summary` | `p_actor uuid, p_request_id uuid, p_payload_hash text, p_topic_id uuid, p_draft_hash text, p_locale text, p_manifest jsonb, p_prompt_version text, p_validator_version text` → `jsonb` | same `(actor, request_id)`: same payload → return the existing run (`replayed:true`), different → `payload_conflict`; `p_draft_hash` must equal the current draft hash else `draft_changed`; inserts `state='running'`, `usage_audit_key = run_id::text`; audit `summary_run` |
| `topic_record_summary_completion` | `p_run_id uuid, p_raw_output jsonb, p_finalize_payload jsonb` → `void` | only while `running` |
| `topic_finish_summary` | `p_run_id uuid, p_state text, p_provider text, p_model text, p_raw_output jsonb, p_validation jsonb, p_rendered jsonb, p_finalize_payload jsonb` → `jsonb` | `accepted` requires `p_rendered` and inserts a `topic_summaries` row `status='generated'`; a run whose `validator_version` differs from the stored one finishes `failed` with `validator_version_changed` |
| `topic_mark_summary_finalized` | `p_run_id uuid` → `void` | |
| `topic_expire_summaries` | `p_actor uuid` → `integer` | `running` runs older than 10 minutes → `abandoned` |
| `topic_approve_summary` | `p_summary_id uuid, p_decision text, p_actor uuid` → `void` | `approve`: the run is `accepted` and `draft_hash` equals the current draft hash, else `summary_mismatch`; an older approved summary for the same `(topic, draft_hash, locale)` becomes `discarded` first; audit `summary_approve` |

Port additions: `claimSummary`, `recordSummaryCompletion`, `finishSummary`, `markSummaryFinalized`, `expireSummaries`, `approveSummary`, `summariesOf(topicId, draftHash)`, `approvedSummary(topicId, draftHash, locale)`.

- [ ] **Step 1: Failing tests**: contract cases for claim/replay/conflict, accept → generated → approve, approve after a draft edit → `summary_mismatch`, one approved per `(topic, draft_hash, locale)`; integration: `authenticated` cannot read `topic_summary_runs` or `topic_summaries`; `topic_publish` with an approved summary succeeds only after `summary_public_enabled` is set (D11).
- [ ] **Steps 2–5:** run (fail) → implement → both PG commands (pass) → commit (`feat(topics): summary run storage`).

### Task T9.5: usage feature `topic_summary` (D3, X4)

**Files:** Create `supabase/migrations/20261210093000_usage_feature_topic_summary.sql`, `src/lib/billing/usage-feature-migration.test.ts`; Modify `src/lib/billing/quota.ts`, `src/lib/billing/metered-llm.ts`, `src/app/api/usage/today/route.ts`, `src/components/UsageToday.tsx`, and the tests that enumerate features (`quota.test.ts`, `usage/today/route.test.ts`)

Migration, in one transaction: drop and re-add the two check constraints (`usage_events_feature_check` — confirm the name with `select conname from pg_constraint where conrelid='public.usage_events'::regclass and contype='c'` on a local database first — and `llm_cost_reservations_feature_check`) with the list `('copilot','perspectives','brief_preview','topic_summary')`; `create or replace` the five functions copied verbatim from their latest definitions (`reserve_llm_daily_budget` and `create_cap_exempt_llm_audit` from `20260728140000_cap_exempt_platform_audit.sql`; `begin_usage_run`, `finalize_usage_run`, `record_usage_event` from `20260728130000_usage_run_lifecycle.sql`) with only the whitelist literal changed.

TypeScript: `quota.ts`: `export type QuotaFeature = UsageFeature | 'topic_summary'`; `PLAN_LIMITS` gains `topic_summary` (free 0, every paid plan 20; admins are `budgetExempt`, and only admins can call the route); `metered-llm.ts`: `feature: QuotaFeature`. `usage/today` and `UsageToday.tsx` do not list the new feature (it is admin-only); their feature arrays stay as they are, typed against `UsageFeature`.

- [ ] **Step 1: Failing test** (`usage-feature-migration.test.ts`, text comparison, no database): for each of the five functions, the body in the new migration equals the body in its source migration after replacing `'brief_preview')` with `'brief_preview', 'topic_summary')` (normalising whitespace); the migration contains exactly two `add constraint` statements; `PLAN_LIMITS` has a `topic_summary` key for every plan. Integration (in `topics.integration.test.ts`): `insert into usage_events … feature='topic_summary'` succeeds and `'nonsense'` fails.
- [ ] **Step 4:** `npm test -- src/lib/billing src/app/api/usage` and both PG commands · Expected: PASS; `npm test -- src/lib/judgments/methodologies/macro-regime.v2.test.ts` · Expected: PASS (`database.types.ts` untouched). **Step 5:** commit (`feat(billing): topic_summary usage feature`).

### Task T9.6: generate / approve routes, prompts, admin UI

**Files:** Create `src/lib/topics/summary/request.ts`, `…/request.test.ts`, `src/lib/topics/summary/prompts/topic-summary-v1.zh.md`, `…/topic-summary-v1.en.md`, `src/lib/topics/summary/llm-deps.ts`, `src/app/api/admin/topics/[id]/summary/route.ts`, `src/app/api/admin/topics/[id]/summary/[summaryId]/approve/route.ts`, `…/discard/route.ts`, `src/components/topics/admin/publish/SummaryBlock.tsx`

`request.ts`: `handleSummaryRequest(d:AdminDeps&{llm:LlmDeps}, actor, {topicId, request_id, locale})`: assemble the draft (public projection) → `topicFacts` → no facts → 409 `no_facts` → manifest = `{facts, incomparable, draft_hash}`; payload hash = `sha256Hex(canonicalJson({topicId, draft_hash, locale}))`; subject: `system` = prompt file, `user` = lines `fact_id: text` (rendered in the locale), `validate` = `validateTopicSummary`, `render` → `RenderedSummary` (each fact with its `refs`, each point with `refs` = union of its facts' refs, `prompt_version:'topic-summary-prompt/1'`, `validator_version`, provider, model); run through `runValidatedExplanation` with the T9.4 store. `llm-deps.ts`: `topicLlmDeps(userId)` = `productionLlmDeps`' shape with feature `'topic_summary'`, `budgetExempt` per the existing admin rule, and the macro constants `EXPLAIN_MAX_OUTPUT_TOKENS`, `EXPLAIN_TEMPERATURE`, `EXPLAIN_TIMEOUT_MS`. Prompt text (zh; en parallel): the model receives a list of frozen fact sentences as `fact_id: 文本`; it must return JSON `{points:[{fact_ids, hypothesis}], counterpoints:[{fact_ids, text}]}`; 1–6 points; each item exactly one sentence, ≤ 240 characters, citing 1–4 listed `fact_id`s; no numerals or dates of any kind; no investment advice or rating wording; no statement about the economic regime; hypotheses are mechanisms, phrased as possibilities.

UI (`TopicPublish` block 3–4): card 已接受 (事实句 n · 假设 n · 反方 n; 批准 / 丢弃) or card 被拒 (原因码 mono, "命中片段：“…”", 重新生成); warn note "摘要暂不能对外 … 带摘要的版本不能发布。" while `summary_public_enabled` is false.

- [ ] **Step 1: Failing test** with a fake `LlmDeps`: accepted output → 200, a `generated` summary whose every sentence has `refs`; an output containing a numeral → 200 with `state:'rejected'`, `failure_codes:['numeral']` and the matched fragment; same `request_id` twice → one model call; approve → `approved`; then a draft edit → `checkDraft` reports `summary_mismatch`.
- [ ] **Steps 2–5:** run (fail) → implement → run (pass) → commit (`feat(topics): summary generation and approval`).

### Task T9.7: summary in the snapshot and on the page

**Files:** Modify `src/lib/topics/publish.ts` (pass `approvedSummary` to `assemble` and `summaryId` to `db.publish`), `src/lib/topics/disclosure.ts` callers (real summary input), `PreviewBlock.tsx` (shows the panel in preview even when the switch is off)

- [ ] **Step 1: Failing test**: publish with an approved summary while `summary_public_enabled=false` → `publish_blocked:summary_provider_unconfirmed` and no version; with the switch on and a note naming the provider → v1 whose snapshot `summary` equals the rendered summary; `readTopic` returns it; a masked fact hides the dependent point (already covered by T3.3, asserted here end to end); provider absent from the note → `publish_blocked:summary_provider_mismatch`.
- [ ] **Steps 2–5:** run (fail) → implement → run (pass) → commit (`feat(topics): approved summary frozen into the version`).

---

## PR-10: promotion and licensed excerpts (branch `claude/topics-pr10-promotion`, after PR-6, after PR-9 if both are open; spec T2)

### Task T10.1: promote a private thesis

**Files:** Create `src/lib/topics/promote.ts`, `src/lib/topics/promote.test.ts`, `src/app/api/admin/topics/from-thesis/route.ts`

```ts
export const PROMOTION_COPY_COLUMNS='title,body';
export const PROMOTION_COUNT_COLUMNS='supporting_evidence_ids,invalidation_conditions,watch_metrics,pillars,catalysts,kill_condition_revisions,company_ids,theme_ids';
export const STRIPPED_SCALARS=['last_assessment','status','next_review_at'] as const;
export interface ThesisReader{copy(thesisId:string):Promise<{title:string;body:string}|null>;counts(thesisId:string):Promise<Record<string,number>|null>}
export async function promoteThesis(d:{db:TopicsDb;thesis:ThesisReader;now():Date},i:{thesisId:string;slug:string;category:Category;actor:string}):
 Promise<{topic_id:string;promotion_id:string;stripped:{field:string;count:number|null}[]}>;
```

`sessionThesisReader()` builds the reader from `requireResearchUser().supabase` (the owner's RLS): `copy` = `.from('research_theses').select(PROMOTION_COPY_COLUMNS).eq('id', id).maybeSingle()`; `counts` = one `.select(PROMOTION_COUNT_COLUMNS)` returning array lengths only (object columns count their keys; null → 0). `promoteThesis`: thesis not readable → `not_found`; create the topic with `title:{zh:title, en:title}` and one `owner_note` entry `key:'from-thesis'` whose body is the thesis body in both locales, `blocks_provenance:{'entry.from-thesis':'from_thesis','title':'from_thesis'}`; `recordPromotion` with `source_content_hash = sha256Hex(canonicalJson({title, body}))`, `copied:{fields:['title','body'], at}`, `stripped` = the eight counted fields with counts plus the three scalars with `count:null`. Nothing from the thesis other than title and body is stored anywhere.

- [ ] **Step 1: Failing test** (A11): the draft holds only the thesis title and body; `stripped` lists eleven fields, counts as seeded; the stored promotion row and the audit detail contain none of the seeded private strings (`supporting_evidence_ids` values, `last_assessment` text); an unreadable thesis → 404 and no topic created; `checkDraft` on the fresh draft blocks with `unreviewed_private_block` and, because the thesis body in the fixture contains a number, `numeral_in_owner_text`.
- [ ] **Steps 2–5:** run (fail) → implement → run (pass) → commit (`feat(topics): promote a private thesis into a topic draft`).

### Task T10.2: private fingerprint ids, static guard, no-write proof

**Files:** Create `src/lib/topics/private-ids.ts`, `src/lib/topics/research-guard.test.ts`; Modify `src/lib/topics/deps.ts` (`privateIds`), `topics.integration.test.ts`

`privateIds(supabase)`: four `.select('id')` reads (`research_theses`, `research_memos`, `research_source_documents`, `research_thesis_events`) under the actor's session, merged into a `Set`, kept in memory for the request only.

- [ ] **Step 1: Failing tests**

```ts
// research-guard.test.ts — spec §4.7: the only research_* access is three fixed select lists; no writes, no rpc.
const files=walk('src/lib/topics').concat(walk('src/app/api/admin/topics'),walk('src/app/api/topics'),walk('src/lib/evidence')).filter(f=>f.endsWith('.ts')&&!f.endsWith('.test.ts'));
it('touches research_* tables only in promote.ts and private-ids.ts',()=>{
 expect(files.filter(f=>/from\('research_/.test(read(f))).sort()).toEqual(['src/lib/topics/private-ids.ts','src/lib/topics/promote.ts']);
});
it('uses only the three allowed select lists and never writes',()=>{
 for(const f of ['src/lib/topics/private-ids.ts','src/lib/topics/promote.ts']){
  const src=read(f);
  const selects=[...src.matchAll(/from\('research_\w+'\)\s*\.select\(([^)]*)\)/g)].map(m=>m[1].trim());
  for(const s of selects)expect(["'id'",'PROMOTION_COPY_COLUMNS','PROMOTION_COUNT_COLUMNS']).toContain(s);
  expect(src).not.toMatch(/from\('research_\w+'\)\s*\.(insert|update|upsert|delete)\(/);
  expect(src).not.toMatch(/\.rpc\('research_/);
 }
});
```

Integration (A12, A13), in `topics.integration.test.ts`: seed one row in each of the four `research_*` tables for a user; record `count(*)` and `max(updated_at)` (or `max(created_at)` where the table has no `updated_at`) for each; run promotion → save → check → publish through `pgTopicsDb` with a `ThesisReader` over the same pool acting as that user; assert the four pairs are unchanged; assert a draft whose note contains the seeded `research_source_documents.id` fails the check with `private_reference`.

- [ ] **Steps 2–5:** run (fail) → implement → PG gate (pass) → commit (`feat(topics): private id fingerprints and research_* guard`).

### Task T10.3: promotion UI, thesis link, licence register

**Files:** Modify `src/app/(app)/research/theses/[id]/page.tsx`, `src/components/topics/admin/editor/PickerColumn.tsx`; Create `src/components/topics/admin/editor/NotCarriedOver.tsx`, `src/app/(app)/admin/topics/new/from-thesis.tsx`, `src/lib/topics/licences.ts`, `src/app/api/admin/topics/licences/route.ts`, `src/app/(app)/admin/topics/licences/page.tsx`, `src/components/topics/admin/LicenceRegister.tsx`, model tests for each

Thesis page: one link in the title row (`flex flex-wrap items-center gap-2`), secondary button style of that page, text "以此为起点新建公开专题", `href={`/admin/topics/new?fromThesis=${id}`}`, rendered only when a new prop/endpoint flag says topics are enabled: the page is a client component, so it reads `GET /api/admin/topics` status (200 → render, anything else → nothing); no write, no "promoted" state (§7.4). `/admin/topics/new?fromThesis=` shows the slug + category form and posts to `/api/admin/topics/from-thesis`.

`NotCarriedOver` (right column, shown when the topic has a promotion): heading 未带入的私有内容, the stripped field list with counts (labels in `topicsAdmin.promotion.fields.*`; X9), the warning "{n} 个段落来自私有论点，尚未审阅" with mono `unreviewed_private_block`, and 逐段审阅: for each block with provenance `from_thesis` a row with the block text, 改写 (focuses the field) and 已检查，无私有内容 (sets provenance `reviewed`; any edit of the field also sets `reviewed`). New editor actions `{type:'confirmBlock'; key}` and provenance update on edit.

Licence register (`TopicPublish` block 许可登记): list 来源 / 权限 / 状态; form 来源名称, 发布方, 来源链接, 条款 URL, 条款阅读日期, 条款摘录 (≤ 200), 允许引文, 需要署名 (checked, disabled), 需要链接, read-only caps (120 字 / 60 words / 3 段), 状态 待确认 / 已批准 / 已撤销 → `POST /api/admin/topics/licences` → `db.setLicence`. Port additions: `licences()`, `setLicence(i)`, `publicLicenceStatus(ids)`.

- [ ] **Step 1: Failing tests**: reducer: editing a `from_thesis` field or `confirmBlock` sets `reviewed`, after which `runDisclosure` check 4 passes; `licenceForm` model: `需要署名` cannot be unchecked, caps not editable, https validation; licences route: create → 201, update status to `revoked` → audit `licence_change`; a source assertion that the thesis page adds exactly one `href` containing `/admin/topics/new?fromThesis=` and no `fetch(` with a non-GET method.
- [ ] **Steps 2–5:** run (fail) → implement → run (pass) → commit (`feat(topics): promotion review UI, thesis link and licence register`).

### Task T10.4: licensed excerpts

**Files:** Create `src/lib/topics/excerpts.ts`, `src/lib/topics/excerpts.test.ts`; Modify `src/lib/topics/drafts.ts` (accept `licensed_excerpt`), `src/lib/topics/disclosure.ts` (check 6 uses `EXCERPT_CAPS`), `src/lib/topics/masking.ts` + `public-read.ts` (licence status join), `src/components/topics/dossier/EntriesBlock.tsx`, `src/components/topics/admin/editor/TextColumn.tsx` (entry type offered only when at least one licence is `approved`: D13)

```ts
export const EXCERPT_CAPS={maxCharsZh:120,maxWordsEn:60,maxFragments:3} as const;   // D2
export function fragmentLength(text:string):{zhChars:number;enWords:number};
export function excerptViolations(entry:Extract<DraftEntry,{entry_type:'licensed_excerpt'}>,licence:{status:string;permits:Record<string,unknown>}|undefined):string[];
export function maskExcerpts(entries:DraftEntry[],status:ReadonlyMap<string,'pending'|'approved'|'revoked'>):(DraftEntry|{key:string;entry_type:'licensed_excerpt';masked:true;reason:'licence_revoked';attributions:{attribution:string;url:string}[]})[];
```

A fragment is over the cap when it has more than 120 CJK characters or more than 60 Latin words. Rendering: quote, then "— {attribution} · {date} · link", then the fixed note "引文中的数字为原文表述，未经本站核实"; a masked entry shows "引文已遮蔽 该来源的许可状态已变更，引文不再显示；署名与链接保留。". Excerpt text never enters `ownerTexts` (numbers in quotes are allowed) and never enters the summary input.

- [ ] **Step 1: Failing test**: caps at the boundary (120 / 121 characters, 60 / 61 words, 3 / 4 fragments); missing attribution, date or non-https link → violation; licence `pending` → violation; (A16) a published version with an excerpt, then `setLicence(status:'revoked')` → `readTopic` returns the masked entry in the current, version and replay views, the JSON no longer contains the fragment text, and `snapshot_hash` is unchanged; with no approved licence the editor model offers no excerpt option.
- [ ] **Steps 2–5:** run (fail) → implement → run (pass) → commit (`feat(topics): licensed excerpts with caps and read-time licence masking`).

---

## PR-11: Copilot tool (branch `claude/topics-pr11-copilot`, after PR-7; spec T4)

### Task T11.1: `topic_dossier`

**Files:** Create `src/lib/topics/copilot.ts`, `src/lib/topics/copilot.test.ts`; Modify `src/lib/agent/tools.ts`

`copilot.ts`: `topicDossierTool: AgentTool` (`name:'topic_dossier'`, `category:'研究'`, input schema `{slug, version?, asOf?, locale, sections?}`), handler → `callApi(origin, '/api/topics/<slug>…')` then `toToolOutput(dto, sections)`: per evidence item `{ordinal, ref:{kind,id,as_of}, state, reason, text (the fact sentence, only when ok and unmasked), drift}`, plus `version_no`, `published_at`, and the summary's rendered sentences with refs. No owner draft, no admin projection, no excerpt text beyond what the public page shows, no drawer payload. A non-200 from the API is returned as `{unavailable:true, code}`. The tool description instructs: quote numbers exactly as returned with `ordinal` and version; when the tool says missing or withheld, say so and do not fill the gap from memory or other tools.

`tools.ts`, inside a fence at the end of the array:

```ts
  // TOPICS ↓ registered only when the module's env flag is on; the handler checks the public switch through the API (404 → unavailable)
  ...(topicsEnabled() ? [topicDossierTool] : []),
  // TOPICS ↑
```

(Spec §11 wants both switches at registration time; the tool list is a module-level constant, so the database switch is enforced at call time by the public API instead.)

- [ ] **Step 1: Failing test** (A1): with `TOPICS_ENABLED` unset, a fresh import of `tools.ts` has no tool named `topic_dossier`; with it set, it has one; `toToolOutput` over the scenario dossier contains no `value_text` of a withheld or masked item and no key named `drawer`; an API 404 → `{unavailable:true, code:'not_found'}`.
- [ ] **Steps 2–5:** run (fail) → implement → run (pass) → commit (`feat(topics): topic_dossier Copilot tool`).

---

## PR-12: broker evidence and industry acceptance (blocked; spec T3)

### Task T12.1: `broker_report_meta` resolver

Blocked on spec Q6 (the id: `publication_id` or `(report_id, revision)`) and on a public read by publication id in `src/lib/broker-research` (none exists today; `broker_reports_public_v` exposes `publication_id` as a column, so the reader is a filter on that view). When unblocked: `src/lib/evidence/resolvers/broker.ts` implements the spec §4.1 row (`public_enabled=false` → `withheld:publication_switch_off`; `unpublished_at ≤ now` → `retracted`), `code_version` becomes `evidence-broker/1`, `SAMPLES.broker_report_meta` gains the three states, the picker chip is enabled, and check 1 of the disclosure check stops blocking for resolved refs. Write its test table in the T2.5 form at that time; do not start before the question is answered.

### Task T12.2: industry end-to-end acceptance

When an industry run is active in production and its dataset is `public`: publish a fixture-free topic citing one SIC cell on a preview deployment, confirm `ok` + `basis:'reconstruction'` rendering, drift `unchanged`, and record it in `acceptance.md`. Owner-run; nothing to code.

---

## 9. What needs the owner, and what cannot be verified locally

### 9.1 Owner actions

| # | Action | When |
|---|---|---|
| O1 | Apply `20261210090000`, `…091000` to production (later `…092000`, `…093000`); then merge the one-file chore PR appending them to `supabase/migrations.lock.json` | after PR-1 (and after PR-9) |
| O2 | Set `TOPICS_ENABLED=1` in the Vercel project | when ready to preview as admin (any time after PR-6) |
| O3 | Add the two cron entries to `vercel.json` (runbook §3) | after PR-7 |
| O4 | Open the directory: `POST /api/admin/topics/settings` with one licence confirmation per attribution in use (FRED terms URL and date, SEC, …). This is the licence-gated publication step and needs the owner's explicit yes | after PR-8 |
| O5 | D7: a formal conclusion on FRED's "non-commercial" terms versus a paid product (inherited from the macro module; topics do not widen it) | before O4 |
| O6 | D11: confirm the configured LLM provider's output terms, then set `summary_public_enabled` with the provider note | after PR-9, before any version with a summary |
| O7 | Register and approve each licensed source (D2, D13) | after PR-10, only if excerpts are wanted |
| O8 | Merge every PR | each PR |

### 9.2 Not verifiable from a local session

- Production data state (industry tables, row counts): the industry resolver is proven on fixtures only (T12.2 is the real check).
- Hosted Supabase behaviour that differs from local PostgreSQL 17: non-superuser `postgres`, real JWT-based `authenticated` role (locally `set local role authenticated`), PostgREST exposure of the new views and RPCs.
- Vercel cron execution, `maxDuration`, and `unstable_cache` revalidation of the chain flag.
- A real LLM call for the summary (tests use a fake `LlmDeps`); provider latency and refusal behaviour.
- Signed-in end-to-end flows against a real database (Playwright runs in fixture mode only; it is not a CI step).
- Visual fidelity on real phones; the comparison is against the artboards in a desktop browser at 390 px.

## 10. Open questions

**For the owner**
- Q-O1 (X5): confirm that "series the macro module already serves" (catalog `status` and `rights`) is the D7 gate, since `licenses.json` has no per-series entries.
- Spec Q1: will the industry module ever delete runs? If yes, frozen cells of deleted runs show "无法核验" forever.
- Spec Q3: promotion from `research_memos` too? (Plan: theses only.)
- Spec Q5: is a hard purge of a published version ever required? (Plan: unpublish only.)

**For the design session (`local_9ae9dd5e-7bdf-4d46-bf8f-b5586efa7cc6`)**
- Q-D1 (X7): should 不支持 (and the drift words 有更新期 / 现已受限 / 无法核验) join the shared state vocabulary, or stay topic-local as planned?
- Q-D2 (X9): redraw the "未带入的私有内容" rows as the spec's stripped fields with counts.
- Q-D3 (X11): add a reason-category select to the retire dialog.
- Q-D4 (X12): add publisher, source link and terms-read date to the licence form; show 需要署名 as fixed.
- Q-D5 (X13): is a settings screen wanted for opening the directory (licence confirmations, summary provider note), or is the runbook call enough?
- Q-D6 (X24): phone directory and phone admin pages are undrawn; the plan stacks columns.

**For the commander**
- Q-C1 (X15): who rebuilds `/intel` to the `Hub` artboard (five unified cards)? This plan only adds the topic card to the current page.
- Spec Q4: schedule PR-9 when no macro branch touches the four strategy files.
- Spec Q6 / X6: decide the `broker_report_meta` id with the foreign research session so PR-12 can start.
- X2: confirm the lock stays out of PR-1 (repo convention) despite the brief's wording.

## 11. Self-review record

- **Spec coverage:** every section §1–§17, A1–A18 and the five exit criteria map to a task in section 8.1; every artboard element maps in 8.2. Items deliberately not built: anything in §1.2; `topic_purge`; a settings UI (X13); the `Hub` rebuild (X15).
- **Placeholders:** tasks that describe a test by assertion list instead of full code (UI model tests, route tests) name the function, the inputs and the exact expected values; commented cases inside code blocks carry the instruction "write as real assertions" with the fixture values to use. PR-12 is intentionally not detailed because it is blocked on an unanswered question.
- **Names:** `TopicsDb`, `DraftBody`, `TopicSnapshot`, `Resolved`, `EvidenceSources`, `Assembled`, `DisclosureCheck`, `DriftRow`, `DossierDto`, `PublicEvidence` are defined once (T1.3, T1.4, T2.3, T3.1, T6.1) and used with the same fields afterwards; port methods added later are listed where they are added (T9.4, T10.3).
