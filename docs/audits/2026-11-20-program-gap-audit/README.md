# Program gap audit — five research sections, 2026-11-20

Audited tree: `main` at `ecd1ef31` (after PR #293). Production reports the same commit
(`codeVersion` in `GET /api/methodologies`, probed 2026-11-20 02:20 UTC).
Previous audit: 2026-11-16, on `68701c48` (after #226); it was not committed to the repo.
Mandate: `docs/research/chaosai-integration-2026-11-04/EXPERT_PLAYBOOK_AND_BRIEF.md` §5.

## 中文摘要

- 生产与 `main`（`ecd1ef31`）一致。宏观策略、行业研究（美国 SIC）、公司研究（美股）已上线；外资研报、专题研究代码已合入但关闭。
- 宏观最完整：时钟、判断层、联储流动性、配置假设模板、关键观察都在线。缺口：ISM / LPR / MLF / 社融缺失，VIX 与四个指数受限，传导页冷启动超过 1 秒（已暂停）。
- 行业：只有美国 SIC 的营收、利润、毛利率、净利率。444 个行业中仅 13–15 个达到展示门槛。申万 / A 股、估值、行业判断都未上线。
- 公司：美股 807 家可回放。A 股数值全部扣留（无逐值 PDF 定位），港股未服务；没有公司级判断方法；金标集全部未就绪。
- 外资研报：代码齐全，默认关闭；生产环境的 PDF 解析适配器未接通，许可 D1 未定（已暂停）。
- 专题研究：PR-1 至 PR-11 已合入，模块关闭；PR-12 卡在规格 Q6；许可引文的视图遮蔽正在修。
- 可立即并行开工的工程项 18 个（第 9.1 节），等待 owner 决定的 12 项（第 9.2 节），已暂停 6 项（第 9.3 节）。
- 无法从仓库或匿名探测核实的 12 条，列在第 8 节，请协调会话核对。

## 1. Method and evidence classes

| Tag | Meaning |
|---|---|
| code | read in the tree at `ecd1ef31`; path given |
| PR | merged pull request number in `osborn-studio/osbornalpha` |
| probe | unauthenticated `curl` of `https://osbornalpha.com`, 2026-11-20 02:15–02:25 UTC |
| doc | stated in a repo document; not re-checked against production |
| not verified | could not be established from the repo or an unauthenticated probe; listed in §8 |

No build, test suite, dev server, signed-in page, production database or Vercel setting was
used. Flag values in production are therefore "doc" or "not verified" unless a probe shows
their effect. Abandoned sections (竞争分析, 模拟组合, 行业数据, 他山之石) are out of scope.

Probe results used below:

| Probe | Result |
|---|---|
| `/macro`, `/intel`, `/intel/*` | 307 to `/login` (signed-in pages; content not verified) |
| `GET /api/methodologies` | 200; `codeVersion` `ecd1ef31…`; `macro_regime` v1 `publishable=false`, v2 `publishable=true`; no other methodology |
| `GET /api/industries` | 200 in 6.8 s; scheme `sic`, generation 5, `activatedAt` 2026-11-17T15:07Z, `factsAsOf` 2026-11-17, `freshness` fresh, `historyClass` reconstruction, 444 nodes, `valuation.state` `not_enabled`, every `nameZh` null |
| `GET /api/industries?scheme=sw` | 400 `invalid scheme` |
| `GET /api/companies` | 200; `total` 807, all US; `conceptsTotal` 35 |
| `GET /api/companies?market=CN` | 200; `total` 0 |
| `GET /api/companies/600519.SH/overview` | 200; issuer present, `coverage` null, `latest` null, no events |
| `GET /api/companies/0700.HK/overview` | 404 `market_not_served` |
| `GET /api/companies/AAPL/overview` | 200; FY2026 10-K, 3,000 facts, evidence attached |
| `GET /api/companies/freshness` | `facts.us` fresh (2026-11-19 20:05Z), `facts.cn` fresh (2026-11-20 00:35Z), `company.events` fresh (2026-11-20 02:20Z) |
| `GET /api/broker-research/reports`, `/institutions` | 404 `no public reports` / `no public institutions` |
| `GET /api/topics`, `/api/macro/overview`, `/api/macro/strategy/cycle-table` | 401 |

## 2. Macro strategy (宏观策略) — `/macro`

**Shipped and live**
- Workbench with overview, indicators, correlation, methodology views, plus `/macro/[seriesId]`, `/macro/transmission`, `/macro/history`, `/macro/review` (code: `src/app/(app)/macro/**`, `src/components/macro/MacroTabs.tsx:5`).
- Investment clock with decomposition and stored-score check (code: `MacroRegimeClock.tsx`, `ClockBreakdown.tsx`, `clock-weighted.ts:79-85`); `macro_regime@v2` publishable in production (probe).
- Allocation hypothesis template `macro_allocation_template@v1` (code: `src/lib/macro/allocation-template.ts:3`; PR #232).
- P5 WP-C: key cards and marker layers (#246), asset bars and correlation presets and history key observations (#257), transmission folding and column toggle (#245), indicator detail through the display registry (#247).
- Three display-only Fed liquidity series `US_WALCL`, `US_RRPONTSYD`, `US_WTREGEN` (code: `src/lib/macro/display-catalog.ts:12-17`; migration `20261127090000`).
- Manifest persistence as gzip blobs, one-call history RPC, stored fact views, warm cron every 10 minutes (#240, #242, #243; migrations `20261126090000`–`20261126120000`; `vercel.json`).
- Shared research shell, footer and source drawer adopted (#262).

**Switched off or gated**

| Gate | Default | Opens with | Production |
|---|---|---|---|
| `MACRO_STRATEGY_ENABLED` (`src/lib/macro/strategy/flags.ts:13`) | off | `=1` | on (doc: macro-strategy bring-up record) |
| `MACRO_JUDGMENTS_ENABLED` (`src/lib/macro/flags.ts:2`) | off | `=1` | on (doc; consistent with v2 publishable in probe) |
| `MACRO_INGEST_SECRET` (`src/app/api/macro/ingest/route.ts:280`) | 503 | secret set | set (doc) |

**Specified, not built**
- `macro_regime_asset_pair` settleable judgment: type only (`src/lib/judgments/types.ts:24`); registry holds `macroRegimeV2` alone (`src/lib/judgments/registry.ts:11`).
- Liquidity stage in transmission: node `us_rrp_tga` is still `not_in_catalog` (`src/lib/macro/strategy/data/transmission-v1.ts:27`) although the series now exist as display rows; `TRANSMISSION_V2` (P5 spec §5.2) is absent from `src`.
- QE/QT row of the policy-response matrix is always `missing` (`src/lib/macro/strategy/policy-response.ts:33,138`); runbook says it needs an event definition first (`docs/runbooks/macro-strategy.md:103`).
- P5 spec §5.3–5.5 ingestion for LPR, AFRE, MLF: parsers exist but are outside the active registry (`src/lib/macro/parsers/index.ts:17-24`, `parsers/pbc-afre-stock.ts:1`).
- LPR via BIS and `macro_regime@v3`: built in #236, reverted in #238, parked on `claude/macro-wpd-catalog-v3` (paused, §9.3).

**No spec**
- Sector over/underweight (owner declined, P5 spec §11.1).
- Gold, copper, Hong Kong index, LPR 5Y: no catalog row (`src/lib/macro/catalog.ts`).
- Macro → industry link: no reference to industries under `src/lib/macro`.

**Weak**
- Catalog: `US_ISM_PMI`, `CN_LPR_1Y`, `CN_MLF_1Y`, `CN_AFRE_STOCK_YOY` are `missing`; `US_VIX`, `US_SP500`, `US_NASDAQCOM`, `US_DJIA`, `CN_CSI300` are `restricted` (`src/lib/macro/catalog.ts:73-101`).
- Transmission route: 1,469 ms (US) and 1,009 ms (CN) signed-in cold, target 1 s; two sequential self-HTTP calls in `src/lib/macro/strategy/f4-client.ts:54,62` (doc: `docs/audits/2026-11-16-macro-manifest/02-verification.md`). Paused by owner.
- `MANIFEST_GZ_THRESHOLD_BYTES` is 1,000,000 (`src/lib/macro/strategy/db.ts:24`); 512 kB policy-response writes took up to 6.3 s under concurrent cron load, limit 8 s (doc, same file).
- `src/lib/macro/strategy/explain-request.ts:17,101-104` reads prompts with `readFileSync(new URL(...))`; `next.config.mjs` has no tracing include for it. Production behaviour not verified.
- Tab row always lists transmission, history, review (`MacroTabs.tsx:5`); `strategyLinkTabs` has no production caller. With the strategy flag off those tabs reach `notFound()`.
- CN collection runs from the owner's Mac under launchd (`scripts/macro/collect.py`, `docs/runbooks/macro-sync.md` §13.4).
- Review archive: only 2026-10 exists and is `insufficient`; next run 2026-12-03 (`vercel.json` `0 6 3 * *`; doc).
- `docs/methodologies/macro_regime/v2.md:4` says `publishable=false`; production says true (probe).
- Tests: no macro suite under `e2e/`; fixture suites are `tests/macro-integration` and `tests/macro-source-integration`. Browser acceptance for C2a, C2b, C3, F1–F4 was not run (doc: `docs/audits/2026-11-16-macro-wpc/*`, `docs/audits/2026-11-17-macro-foundation/*`); last recorded fixture run 11 of 13.
- `InputsDrawer` not on the shared drawer; close button under 44 px (`src/components/judgments/InputsDrawer.tsx:61`). In flight on `claude/macro-inputs-drawer-5647ab`.

## 3. Industry research (行业研究) — `/intel/industries`

**Shipped and live**
- Pages: list with heatmap and table, detail, constituents (code: `src/app/(app)/intel/industries/**`, `src/components/industries/Heatmap.tsx`).
- US SIC aggregates from EDGAR facts, method `industry-agg-us/1.0`: `revenue_sum`, `net_income_parent_sum`, `gross_margin`, `net_margin`, `revenue_yoy`, `net_income_yoy`, `member_count`; 12M only; last three fiscal years (`src/lib/industry/method-us.ts:9-13`, `read.ts:29`; PR #241; migration `20261130090000`).
- SIC is the default scheme (#266; `src/lib/industry/page-data.ts:55`). Generation 5 active and fresh (probe).
- Crons: `memberships-sic` daily, `aggregate-sic` Sundays 04:30 UTC (`vercel.json`).
- Replay per cell (`/api/industries/[scheme]/[code]/replay`); 50 of 50 sample reproduced on generation 5 (doc: `docs/audits/2026-11-16-industry-data/02-verification.md` §10).
- Shared research UI and shared source drawer for metric cells (#261).
- Industry ↔ company links: constituents to stock pages (`src/lib/industry/hrefs.ts:17`); company page industry chip, US only (`src/lib/company/chain-chips-model.ts:5,16`).

**Switched off or gated**

| Gate | Default | Opens with | Effect |
|---|---|---|---|
| `FACTS_CN_ENABLED` in `src/lib/industry/jobs.ts:152` | off | `=1` | SW/CN `aggregate --apply`; otherwise 403 `job_disabled` |
| `FACTS_CN_INDUSTRY_UNIVERSE` (`jobs.ts:151`, `src/lib/facts/scope.ts:152`) | off | `=1` | widen CN facts scope to SW members (owner decision E) |
| `INDUSTRY_JUDGMENTS_ENABLED` (`src/lib/industry/judgment-contract.ts:57`) | off | `=1` plus a registered method (none exists) | judgment area on the detail page |
| `TUSHARE_TOKEN` (`jobs.ts:42,149`) | — | token | jobs `load-a-share`, `memberships-sw`, `marks` |
| scheme `sw2021` in production | no data | owner decisions A1, A2, E and CN publication (`docs/audits/2026-11-16-industry-data/03-owner-checklist.md`) | paused, §9.3 |

Jobs `load-a-share`, `facts-scope`, `memberships-sw`, `marks`, `aggregate` exist as script jobs only and are not in `vercel.json`.

**Specified, not built**
- Valuation I-3 (PE/PB, percentiles, official comparison): jobs return `deferred_i3` (`jobs.ts:41,88`); components show "not published"; probe shows `not_enabled`. Waits on decisions H and C (paused).
- Industry judgments (lifecycle, prosperity, valuation verdict): input adapter exists (`src/lib/judgments/inputs.ts:174`); no method registered; no file under `docs/methodologies/` for industry. Spec §7.1 defers to a separate method spec that does not exist.
- Point-in-time SIC membership from EDGAR filing headers (spec §19.2 follow-up). Every run is `reconstruction`.
- TTM and single-quarter figures for SIC (spec §19.3); `mode=recompute` returns 501 for SIC (runbook line 58).
- CSV export and mobile table-first layout (spec §18.1 #68).
- Golden sets (spec §13.4): need owner transcription.
- Evidence kind for membership: the shared drawer adapter returns null for membership cells (`src/components/industries/source-drawer-adapter.ts:13`).

**No spec**
- Industry tags, supply-chain graph, alternative data, cross-market peers (spec §1.2 defers them).
- Metrics beyond the seven above (capex, operating cash flow, US ROE).
- HK industries.

**Weak**
- Coverage: with thresholds of at least 5 members and 80% with data (`src/lib/industry/method-constants.ts:6-7`), revenue passes for 15 (FY2023), 14 (FY2024), 13 (FY2025) of 444 codes; 7372 sits at 53 of 69 (doc: `02-verification.md` §7, §10).
- 68 of 811 members had no synced facts on generation 5; 81 issuers were in facts back-off (doc: `02-verification.md` §4, §10).
- First scheduled `aggregate-sic` run is 2026-11-22 04:30 UTC; not yet observed. Generation 5 came from a hand-triggered call (probe: `activatedAt` 2026-11-17).
- `GET /api/industries` took 6.8 s unauthenticated (probe, single sample).
- SIC node names have no Chinese (`nameZh` null on all 444 nodes; probe).
- Weekly `replay-check` is manual; no admin endpoint withdraws an active run (runbook lines 25, 62).
- `e2e/industries.spec.ts` runs only in fixture mode (line 8); never run against a live stack. Signed-in sample taken on generation 2 only, zh not sampled (doc).
- Runbook §2 still names `sw2021` as default; percentile window default is `10y` in code (`route-params.ts`) and `11y` in spec §6.5.

## 4. Company research and tracking (公司研究与跟踪) — `/stock/[ticker]`, `/intel/companies`

**Shipped and live**
- Company page tabs: overview, statements, metrics, filings, tracking, judgments; "more" holds AI view, signals, holdings (`src/components/company/ViewTabs.tsx:8-9`; PR #264). Directory at `/intel/companies`.
- US: 807 issuers, statements, filings, metrics, replay by `asOf`, per-value evidence against EDGAR (probe; `src/lib/company/evidence-gate.ts:44-46`).
- Tracking inbox and watches (`src/app/api/tracking/**`); events of three kinds `filing_published`, `period_first_seen`, `fact_revised` (`src/lib/company/types.ts:8-9`), matching spec §7.2. `company.events` fresh (probe).
- Hourly `company-digest` cron; chunked evidence replace (#230; migration `20261129090000`).
- `DisclosureDrawer` and `f3-source-drawer` on the shared drawer (code: `src/components/company/DisclosureDrawer.tsx:12`, `f3-source-drawer.tsx:6`).
- Statements CSV export (`StatementsView.tsx:63`).

**Switched off or gated**

| Gate | Default | Opens with | Effect |
|---|---|---|---|
| `NEXT_PUBLIC_COMPANY_JUDGMENTS` (`src/lib/company/client.ts:50,53`) | off | `1` or `true`, plus an issuer method (none exists) | judgments tab content |
| `NEXT_PUBLIC_COMPANY_F3_DRAWER` (`client.ts:51-52`) | on | `0` turns off | F3 source drawer |
| `DOCUMENTS_SYNC_ENABLED` (`src/lib/documents/flags.ts:6-8`) | off | `=1` | three `documents-sync` crons in `vercel.json` return `skipped: disabled` until set |
| `DOCUMENTS_EXTRACT_ENABLED`, `DOCUMENTS_CANDIDATES_ENABLED` | off | `=1` and two cron entries added to `vercel.json` (absent today) | extraction and candidate stages |
| CN values | withheld as `citation_pending` | a per-value PDF locator source; production uses `emptyPdfLocatorSource` (`src/lib/company/deps.ts:64`) | CN statements on public routes |
| HK | 404 `market_not_served` (`src/lib/company/route.ts:55`) | HK market in company tables (they allow only `US`,`CN`: `20261118090000_company_research.sql:22`) and the document pipeline | HK company pages |
| `FACTS_CN_ENABLED` for facts sync (`src/app/api/cron/facts-sync/route.ts:48`) | on | `0` turns off | CN facts sync; `facts.cn` fresh (probe) |

**Specified, not built**
- Issuer-level judgment methodology: none registered (`src/lib/judgments/registry.ts:11`); `docs/methodologies/` holds `macro_regime` only.
- Judgment events in the tracking inbox (spec §7.3, phase C5): waits on an F4 event DTO.
- CN per-value PDF locators (cninfo reconciliation).
- HK company layer (spec §10.3).
- Transcripts group: placeholder (`src/components/company/FilingsView.tsx:75-76`).
- Merged-issuer lineage is read by filings and metrics only; statements, drawer, overview, packet, events read one issuer (spec §17 line 771).
- `docs/audits/2026-11-04-company-research/expert-sampling.md` does not exist; `events-gold.md` and `regression-sample.md` are blank templates.

**No spec**
- Header price, PE, PB, market cap: excluded by owner decision J (spec §1.2, §5.2).
- Event kinds beyond the three (buybacks, insider selling, guidance changes): playbook §2.3–2.4 only.
- Peer table, Monte Carlo DCF, forced counter-thesis field.

**Weak**
- CN: directory lists 0 CN companies and `600519.SH` has null coverage while `facts.cn` is fresh (probe). Whether CN facts exist behind the evidence gate is not verified.
- Gold sets: `src/lib/facts/fixtures/gold/plan2.json` `ready:false`, 50 pending; `src/lib/documents/fixtures/gold/hk-facts.json` `ready:false`, 36 pending; company manifest 3 pending; `src/lib/dq/fixtures/gold/cn-annual-v1.json` absent, waiting on owner decision C (`docs/runbooks/cn-gold-transcription.md:3,46`).
- Eval kinds disabled in `src/lib/evals/kinds/registry.ts:12-16`: `dual_source` ("plan 3 merged"), `reference_regression` ("macro migrations"), `extraction_gold` (D8 licence), `judgment_calibration`. The first two prerequisites have merged (#108, #109).
- `EDGAR_FILES_VERIFIED=false` (`src/lib/documents/sources/edgar.ts:20`): historical EDGAR `files[]` pages are not read.
- Judgment card: issuer UUID as subject chip (`src/components/judgments/JudgmentCard.tsx:107`), concept ids in the abstain list (`:77`), double frame inside `MarkCard`. In flight on `claude/judgment-card-fixes-6040e4`.
- `FormulaDrawer` still uses the local `DrawerShell`.
- `e2e/company.spec.ts` needs a seeded local database and has no recorded run; `e2e/company-fixture.spec.ts` mocks every `/api/**` call (doc: `docs/runbooks/company-research.md:214`).
- Spec inconsistency: CN net-debt basis differs between §0.2 #65 and §13 case 6.

## 5. Foreign research (外资研报) — `/intel/foreign-research`

**Shipped and live**: nothing is public (probe: both public APIs answer 404 "no public …").

**Shipped, switched off** (PR #252, #260; migrations `20261202090000`–`20261202092000`, locked and applied per #258)
- Public pages (list, report, institution) and public API (`src/app/api/broker-research/**`).
- Admin: upload, licences, document, review, publish dialog, preview, institutions, access log (`src/app/(app)/admin/broker-research/**`, about 40 admin routes).
- Private bucket, signed read URLs of 600 s, access log written before the URL is issued (`src/lib/broker-research/storage.ts:7`).
- Pipeline code: parse, chunked extraction with 400-character quote cap (`extract/schema.ts:6`), rules R1–R10, independent summary with overlap and grounding checks, snippet cap per licence (`snippets.ts:19,24`), disclosure check, verification, replay.
- Licence register (`broker_report_licences`, `licences.ts`).
- Links, all behind the switch: chain step 04 (`src/app/(app)/layout.tsx:28`), company page reports block and chip, `/intel` entry card.

What switches it on, in order (`docs/runbooks/broker-research.md` §2–3):
1. Owner decision D1: licence confirmed per source, including external LLM processing. Until then no licence is confirmed and every public view returns 0 rows.
2. Receipts: `test:storage` and a gold receipt with at least 30 documents matching `approved_gold_corpus_hash` (O14). Neither exists in `docs/audits/2026-11-06-foreign-research/`.
3. A working F3 adapter: `productionF3Port` always returns unavailable, reason `adapter_not_wired` even with `BROKER_RESEARCH_F3_ENABLED=1` (`src/lib/broker-research/ports/f3.ts:22`). No real PDF can be parsed in production today.
4. `BROKER_RESEARCH_LLM_ENABLED=1` (`ports/llm.ts:15`).
5. `POST /api/admin/broker-research/settings/public {"enabled":true}` sets `broker_research_settings.public_enabled`. The route checks admin and Origin only, not steps 1–2 (`licences.ts:74-78`).
6. Add `broker-research-verify` and `broker-research-outbox` to `vercel.json` (absent today).

**Specified, not built**
- Production F3 adapter (spec §11.1; integration plan task E).
- FR-6 public launch run; FR-7 settlement and hit-rate display (closed port only, `ports/f4.ts:14`).
- Earnings-forecast extraction, latest price, ISIN/FIGI mapping (spec §1.2, §11.4): deferred by the spec.
- Topic resolver for broker evidence: stub returning `foreign_research_not_wired` (`src/lib/evidence/resolvers/broker.ts:5`).

**No spec**
- Near-duplicate detection (playbook §3.5; code dedupes by sha256).
- Broker ratings feeding the company consensus card (playbook §3.2).

**Weak**
- 18 open rows in `docs/audits/2026-11-06-foreign-research/C-verify-disposition.md` (non-atomic multi-step writes, raw model I/O durability, eval and replay hashes).
- Tasks D4–E1 had no independent audit (spec §17.1).
- No real PDF has been processed; fixtures are synthetic. No Playwright spec for the section; `e2e/company-fixture.spec.ts:103-106` asserts only the "not served" chip.
- Spec §17.1 line 841 still says the three migrations are not applied.
- Whether the storage bucket exists in production: not verified.

## 6. Topic research (专题研究) — `/intel/topics`

**Shipped and live**: nothing is visible to non-admins (probe: `/api/topics` 401; module closed by flag per doc).

**Shipped, switched off**
- PR-1 schema (#271), PR-2 evidence-ref/1 with five resolvers (#270), PR-3 directory and read API (#273), PR-4 dossier (#275), PR-5 admin editor (#274), PR-6 publish flow (#276), PR-7 drift check, replay verification, chain step 05, hub card (#278), PR-8 Playwright fixtures and runbook (#279), PR-9 validated summary (#287, fix #288), PR-10 promotion, licence register, licensed excerpts (#289), PR-11 `topic_dossier` Copilot tool (#290).
- Migrations `20261210090000`–`20261210093000`, all four in `supabase/migrations.lock.json` (#272, #291).

What switches it on, in order (`docs/runbooks/topic-research.md` §2–3; plan O1–O4):
1. Migrations applied (PR titles #272 and #291 say applied; production bytes not verified).
2. `TOPICS_ENABLED=1` (`src/lib/topics/flags.ts:4`): admin pages, crons, Copilot tool.
3. Admin creates, checks and publishes a first version.
4. `POST /api/admin/topics/settings` with per-source licence confirmations sets `public_enabled` (`20261210090000_topics.sql:7-20`).
5. Add `topic-drift` and `topic-verify` to `vercel.json` (absent today).
6. `summary_public_enabled` additionally needs a `summary_provider_note` (check constraint) and the provider-terms decision O6/D11.

**Specified, not built**
- PR-12 T12.1 `broker_report_meta` resolver: blocked on spec Q6 (spec line 628). T12.2 industry end-to-end acceptance: owner-run.
- Editor control for a `licensed_excerpt` entry: none under `src/components/topics/admin/editor/`; the TopicEditor artboard has no drawing for it (doc: PR #289 body).
- Admin hub card label "未对外 · 预览" (plan X27).

**Weak**
- `topic_versions_public_v` returns the full frozen snapshot, including a quote whose licence was later revoked, to any signed-in reader of the view (`20261210090000_topics.sql:240-247,272`); masking exists only in the app (`src/lib/topics/public-read.ts:65-66`). `topic_licence_status_public_v` exposes `status` only. In flight on `claude/topics-licence-mask-cfc793`.
- Promotion is two RPCs without a transaction (`src/lib/topics/promote.ts:56-57`).
- Summary generation uses the admin's own LLM provider, no platform fallback (`src/lib/topics/summary/llm-deps.ts`); spec default D11.
- Admin POST accepts a request with no `Origin` header (`src/lib/topics/admin-route.ts:31`).
- `docs/runbooks/topic-research.md` omits migrations `…092000` and `…093000` and still calls summaries and excerpts later work; `docs/audits/2026-11-16-topic-research/acceptance.md:20-27,53-58` still marks A9, A11, A12, A16 deferred although tests exist.
- Not verified per `acceptance.md:60-68`: hosted roles and PostgREST exposure, cron delivery, live LLM calls, signed-in flows against a real database, phones. A10 (macro regression after the refactor) has no recorded result.
- Open PR #295 (`claude/fix-promotion-link-test`) changes a topics test.

## 7. Shared hub and foundation

**Shipped and live**
- Research chain 01–05 in the app layout; foreign and topic steps follow their public switches (`src/app/(app)/layout.tsx:28`, `src/components/research-ui/chain.ts:13`; PR #254).
- `/intel` hub with five cards; foreign and topic cards open only when their API answers 200 (`src/app/(app)/intel/page.tsx`, `hub-model.ts`; #278).
- `research-ui`: page header, freshness chip, fact / judgment / hypothesis marks, state vocabulary, chart/table switch, footer, shared source drawer (#254). Navigation: seven top links at 1024 px and above, five-tab bottom bar below.
- `/intel/methods`: methodology registry with calibration table (reads `/api/methodologies`).
- zh and en message files have identical file lists (`messages/zh`, `messages/en`).
- Migration lock covers all 84 migrations in `supabase/migrations/`.

**Specified, not built**
- Cross-module plan task E (documents → foreign research) and task G (`docs/superpowers/plans/2026-11-07-cross-module-integration.md:78`).
- Copilot citation contract for macro, industry, company, foreign: only `topic_dossier` has one (`src/lib/agent/tools.ts:146-148`); `financials` reads the company packet; no tool reads macro, industry or foreign research.

**No spec**
- Copilot tools for the other four sections.
- Macro → industry and industry → macro links beyond the chain row.

**Weak**
- Light-theme tertiary text `#a1a1aa` on white (`src/app/globals.css:41`), about 2.6:1; the contrast test covers the dark theme only.
- Two disclaimer texts: `components.disclaimer` on `/intel` and 17 pages, `research.footer.disclaimer` in `ResearchFooter`.
- `src/components/research-ui/README.md:86-96` migration notes are out of date (all listed drawers have migrated).
- `/intel/methods` does not use `research-ui`.
- Hub fidelity to the Hub artboard: commit `d93287bb` says rebuilt; plan Q-C1 still lists it open. Not verified.
- No generator for `supabase/migrations.lock.json`; entries are hand-added (doc: session note; `scripts/ci/research-checks.ts` only reads it).
- Open PR #294 changes the verify skill for the HK 1D chart.

## 8. Not verified — checks for the coordinating session

| # | Check | How |
|---|---|---|
| V1 | Production values of `MACRO_STRATEGY_ENABLED`, `MACRO_JUDGMENTS_ENABLED`, `TOPICS_ENABLED`, `DOCUMENTS_*_ENABLED`, `FACTS_CN_*`, `INDUSTRY_JUDGMENTS_ENABLED`, `NEXT_PUBLIC_COMPANY_JUDGMENTS`, `BROKER_RESEARCH_*` | Vercel env list |
| V2 | Migrations `20261210092000` and `20261210093000` applied with the #288 bytes | production migration history |
| V3 | Scheduled `aggregate-sic` run on 2026-11-22 04:30 UTC succeeds and a new generation activates | `GET /api/industries` `header.generation`, `dq_freshness` |
| V4 | Why `/api/companies?market=CN` returns 0 and `600519.SH` has null coverage while `facts.cn` is fresh | row counts of CN facts and the evidence gate result |
| V5 | Explanation prompts load in production (`explain-request.ts`) | one signed-in explanation request |
| V6 | Macro review run for 2026-11 on 2026-12-03 produces a result | review archive after the cron |
| V7 | Signed-in rendering of `/macro`, `/intel`, `/intel/industries` (zh), `/stock/AAPL` after #286 | owner's browser session |
| V8 | Hub matches the Hub artboard | same session |
| V9 | `broker-research` storage bucket exists and is private in production | Supabase storage settings |
| V10 | Count of issuers still in facts back-off (was 81 on 2026-11-17) | facts sync state |
| V11 | Cisco digest retry after the 24 h back-off | `company.events` backlog |
| V12 | 24-hour window of manifest writes with no `57014` | Supabase logs |

## 9. Backlog

Sizes: S one PR of a day or less; M two to four PRs; L more. New migrations need a
timestamp above `20261210093000`. Shared files that two sessions must not edit at once:
`vercel.json`, `supabase/migrations.lock.json`, `messages/*/research.json`,
`src/components/research-ui/**`, `src/lib/evidence/**`. Files inside the `macro_regime@v2`
hash closure must not change: `src/lib/industry/types.ts`, `src/lib/facts/types.ts`,
`src/lib/judgments/origins.ts` (doc: session notes; list via `importClosure` in
`src/lib/judgments/formula-hash.ts`).

In flight now and excluded from the tables: judgment card leftovers
(`claude/judgment-card-fixes-6040e4`), topic licence view masking
(`claude/topics-licence-mask-cfc793`), macro `InputsDrawer` migration
(`claude/macro-inputs-drawer-5647ab`), PR #294, PR #295.

### 9.1 Ready to start

"Par" marks items that touch no file of any other Par item and can run in parallel today.

| ID | Section | Outcome | Size | Touches | Migration | Par | Order / note |
|---|---|---|---|---|---|---|---|
| R1 | Industry | Issuers stuck in facts back-off are diagnosed and synced, so more SIC industries pass the display thresholds. | M | `src/lib/facts/**` (not `types.ts`), `scripts/facts` | no | Par | before R2 |
| R2 | Industry | SIC aggregates cover more than three fiscal years and add TTM figures (spec §19.3). | M | `src/lib/industry/method-us.ts`, `read.ts`, `src/components/industries/**` | no (method version bump) | — | after R1; same files as R4, R5 |
| R3 | Company | Statements, drawer, overview, packet and events read merged-issuer lineage like filings and metrics do. | M | `src/lib/company/**`, `src/app/api/companies/[ticker]/**` | no | Par | |
| R4 | Industry | Membership cells open the shared source drawer through a membership evidence kind. | M | `src/lib/evidence/**`, `src/components/industries/SourceDrawer.tsx`, `source-drawer-adapter.ts` | no | — | after the topic licence-mask branch merges (shared `src/lib/evidence`) |
| R5 | Industry | SIC pages get CSV export and a table-first phone layout (spec §18.1 #68). | S | `src/components/industries/**`, `messages/*/industries.json` | no | — | after R2 |
| R6 | Industry | A weekly `replay-check` cron and an admin endpoint that withdraws an active run exist. | S | `src/app/api/cron/industry-sync`, `src/app/api/admin/industries/**`, `vercel.json` | no | — | serialise on `vercel.json` |
| R7 | Industry | `GET /api/industries` answers within its target when cold. | S | `src/lib/industry/read.ts`, `src/app/api/industries/route.ts` | possibly | — | after R2 |
| R8 | Macro | The tab row hides transmission, history and review when the strategy flag is off. | S | `src/components/macro/MacroTabs.tsx`, `MacroWorkbench.tsx`, `strategy-links.ts` | no | Par | |
| R9 | Macro | Mid-size manifests are stored gzip so concurrent writes stay under the 8 s limit. | S | `src/lib/macro/strategy/db.ts` | no | Par | |
| R10 | Macro | Explanation prompts ship as modules and are proven to load in production. | S | `src/lib/macro/strategy/explain-request.ts`, `prompts/` | no | Par | closes V5 |
| R11 | Macro | A recorded green browser acceptance exists for C2a, C2b, C3 and F1–F4, with a signed-in macro spec under `e2e/`. | M | `e2e/` (new macro files), `tests/macro-*` | no | Par | |
| R12 | Company | Eval kinds `dual_source` and `reference_regression` are enabled or carry a current reason. | S | `src/lib/evals/kinds/**` | no | Par | |
| R13 | Company | `FormulaDrawer` uses the shared drawer. | S | `src/components/company/FormulaDrawer.tsx` | no | — | after the judgment-card branch merges |
| R14 | Company | Historical EDGAR `files[]` pages are read, with recorded fixtures (`EDGAR_FILES_VERIFIED`). | S | `src/lib/documents/sources/edgar.ts`, fixtures | no | Par | |
| R15 | Foreign | The 18 open review findings are fixed or closed with a written disposition. | M | `src/lib/broker-research/**`, `docs/audits/2026-11-06-foreign-research/` | possibly | Par | |
| R16 | Foreign | A fixture-mode Playwright spec covers the public and admin pages. | M | `e2e/` (new foreign files), `src/lib/broker-research/fixtures` | no | — | after R15 (same lib) |
| R17 | Topics | Thesis promotion is one transactional RPC. | S | `src/lib/topics/promote.ts`, `db.ts`, new migration | yes | — | after the licence-mask migration lands |
| R18 | Docs | Stale documents match the tree: topic runbook and acceptance record, industry runbook default scheme, `macro_regime/v2.md` publishable line, `research-ui/README.md`, foreign spec §17.1. | S | `docs/**`, `src/components/research-ui/README.md` | no | Par | |

Parallel today: R1, R3, R8, R9, R10, R11, R12, R14, R15, R18 (ten items). R8, R9, R10 sit in
different macro files and can share one session or run separately.
Then: R2 → R5, R7; R4 and R17 after the licence-mask branch; R13 after the judgment-card
branch; R6 whenever `vercel.json` is free; R16 after R15.

### 9.2 Waiting on an owner decision

| ID | Section | Question for the owner (one-line answer) | Unblocks | Size | Touches | Migration |
|---|---|---|---|---|---|---|
| O1 | Company, Foreign | Turn on `DOCUMENTS_SYNC_ENABLED`, `DOCUMENTS_EXTRACT_ENABLED`, `DOCUMENTS_CANDIDATES_ENABLED` in production and add the two missing crons: yes or no? | CN PDF locators, HK company layer, F3 adapter | — | Vercel env, `vercel.json` | no |
| O2 | Company | After O1, should CN statement values go public once each has a cninfo PDF locator, or stay admin-only? | CN per-value locator work | L | `src/lib/company/pdf-locator.ts`, `src/lib/evidence/production-sources.ts`, `src/lib/documents/**` | likely |
| O3 | Company | After O1, build the HK company layer now: yes or no? | HK pages | L | `src/lib/company/**`, `src/lib/facts/types.ts` (hash closure), new migration | yes |
| O4 | Company, Industry | Who transcribes (R1) and who reviews (R2) the gold sets: 50 plan-2 entries, 36 HK, 3 company, CN annual? | gold gates, `extraction_gold` evals, CN publication | M | `src/lib/*/fixtures/gold/**` | no |
| O5 | Company | Do you want a company-level judgment, and which type first (for example earnings-revision direction)? | issuer method spec, judgments tab, inbox judgment events | L | `src/lib/judgments/**`, `docs/methodologies/` | likely |
| O6 | Industry | Do you want the industry judgment method spec (lifecycle / prosperity) written now? | industry judgments | L | `src/lib/industry/judgment-*`, `src/lib/judgments/**`, `docs/methodologies/` | likely |
| O7 | Macro | For VIX, S&P 500, Nasdaq, DJIA, CSI 300: keep restricted, or name a licensed source? And should gold, copper and an HK index be added from a named primary source? | asset coverage | M | `src/lib/macro/catalog.ts` (catalog bump = new `macro_regime` version) | yes |
| O8 | Macro | Move CN macro collection off your Mac to a server: yes, and which host? | unattended CN refresh | M | `scripts/macro/collect.py`, ops | no |
| O9 | Macro | Schedule the QE/QT event definition, transmission v2 liquidity stage and the settleable `macro_regime_asset_pair` now, or later? | three macro work packages, each needs a spec | L | `src/lib/macro/strategy/**`, `src/lib/judgments/**` | likely |
| O10 | Topics | Spec Q6: is the broker report id `publication_id` or `(report_id, revision)`? Spec Q3: allow promotion from research memos too? | PR-12 T12.1; memo promotion | M | `src/lib/evidence/resolvers/broker.ts`, `src/lib/topics/**` | possibly |
| O11 | Topics | Approve a design canvas pass for the licensed-excerpt editor control and open items Q-D2, Q-D4, Q-D6: yes or no? | excerpt editor, licence form fields, phone admin pages | M | `src/components/topics/admin/**` | no |
| O12 | Hub | Should Copilot read macro, industry and company data with a citation contract (needs a spec), and should the old site-wide disclaimer be replaced by the research footer text? | Copilot tools; one disclaimer | L / S | `src/lib/agent/tools.ts`, `src/lib/copilot/**`; the `Disclaimer` component, 17 pages | no |

Smaller owner confirmations recorded in the specs and still open: light-theme tertiary colour
value (dark value approved 2026-11-17); company spec CN net-debt basis; document spec §17.1
zero-output generation rule; whether SIC industry names get a Chinese label table; whether
tracking gains event kinds beyond the three in spec §7.2; foreign research O9 and O13 (where
F3 runs, contract sign-off), which gate the F3 adapter even with O1 answered.

### 9.3 Paused by owner (listed for completeness)

| ID | Section | Item | State in the tree |
|---|---|---|---|
| P1 | Topics | `TOPICS_ENABLED`, topic crons, publication, `summary_public_enabled` | code merged, closed |
| P2 | Foreign | Licence decision D1 and public launch (FR-6) | code merged, closed |
| P3 | Macro | `CN_LPR_1Y` from BIS and `macro_regime@v3` | branch `claude/macro-wpd-catalog-v3`; #236 reverted by #238 |
| P4 | Industry | SW2021 classification rights (decisions A1, A2, E, CN publication) | SW jobs exist as scripts; no production data |
| P5 | Industry | Valuation comparator (decisions H, C; spec I-3) | jobs return `deferred_i3` |
| P6 | Macro | Transmission latency fix | diagnosis in `docs/audits/2026-11-16-macro-manifest/02-verification.md`; no code |
