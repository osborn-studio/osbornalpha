# Drafting brief — topic research spec (2026-11-16)

> Scope change (owner decision, 2026-11-16, received after this brief was first written): only 专题研究 is pursued. 竞争分析, 模拟组合, 行业数据 and 他山之石 are dropped — no spec, no plan. Everything below that concerns those four modules is void: the `EvidenceRef` kinds are `macro_observation`, `industry_metric`, `financial_fact`, `document_citation`, `broker_report_meta` (unmerged), `judgment`; the only flag is `TOPICS_ENABLED`; the only Copilot tool is `topic_dossier`; the topic spec may not depend on podcasts/interviews, AI-ecosystem datasets, peer comparison or a paper portfolio. A second owner change the same day dropped the separate Codex / mmx audit step: the spec gets one self-review pass by the commander against the mandate and the checklist in §2.

Audience: the five spec-drafting subagents and their auditors. Documents only: no code, no migrations, no deploys, no commits (the commander commits).

## 1. What you are writing

One design spec, in Chinese (same register as the existing 2026-11-04 specs), at the path given in your task. Target 35–60k characters: complete, but no padding. A reader must be able to write an implementation plan from it without asking design questions; anything only the owner can decide goes into the owner-decisions section with a default.

Read first, fully:
- Mandate: `docs/research/chaosai-integration-2026-11-04/EXPERT_PLAYBOOK_AND_BRIEF.md` §0, §4, §5 (binding).
- Competitor inventory: `docs/research/chaosai-integration-2026-11-04/REPORT.md` (the parts on your section; §5.5–5.6 for AI data and content), `PAGE_INVENTORY.csv`, `SOURCE_MAP.csv`. The competitor is a functional reference only: none of its data, scores or conclusions are imported, and no spec may propose fetching its pages as a data source.
- Structure models: `docs/superpowers/specs/2026-11-04-company-research-design.md` and `docs/superpowers/specs/2026-11-04-foreign-research-design.md` (read both fully and copy their structure and level of precision).
- Index and conventions: `docs/superpowers/specs/2026-11-04-SPEC-INDEX.md`.
- Whatever foundation spec your section leans on (F3 `…document-pipeline-design.md`, F4 `…judgment-framework-design.md`, F6 `…evals-and-gold-sets-design.md`, industry, macro `2026-11-04-macro-workbench-design.md` and `2026-11-07-macro-workbench-p3-p4-design.md`, `2026-11-07-cross-module-integration-design.md`).
- `DESIGN.md` and `src/app/globals.css` for the UI section.

## 2. Required sections (in this order; numbering as in the reference specs)

Header block (date, draft number, status, upstream specs, and a point-by-point statement of how the spec meets mandate constraints 1–6), then:

1. 目标与非目标 — explicit non-goals.
2. 现状 — what exists on main at `68701c48`, verified. Every table, RPC, route, lib module or flag you name as "existing" must be confirmed with `git grep` / `ls` in this worktree; write what you verified. If something you wanted does not exist, say so and treat it as a dependency or as new work. Never describe an unverified thing as existing.
3. 对方页面逐元素分类 — each element of the competitor page classified as fact / derived / judgment / not built, mapped to a section of your spec.
4. 数据模型 — tables, columns, keys, constraints, RLS posture, immutability rules, described in prose and tables. Migrations are described (name, ordering, lock notes), not written as SQL files.
5. 管道与新鲜度 — collectors/jobs, cadence, idempotency, quarantine, failure states (a failed fetch keeps the previous snapshot and shows a stale state; it never becomes zero).
6. 读取接口 — routes, parameters, `asOf` replay semantics, response states (`ok` / `missing` / `incomparable` / `withheld` / `stale` …), auth.
7. 页面与 UI 流程 — screens and states.
8. 判断层 — which outputs are judgments, their F4 methodology id, inputs snapshot, falsifiable condition, settlement and calibration; or an explicit "no judgments in this module".
9. 开关与能力矩阵 — flags (server flag default off; DB-level publish switch where licence-gated) and a capability matrix: capability × market/dataset × state (served / withheld / not built) at each phase.
10. 许可表 — every external source: owner, URL of the terms actually read, the clause relied on (one short quotation of under 15 words, otherwise paraphrase), what it permits (store / display / redistribute / derive), our decision, and what remains for the owner to confirm.
11. Copilot 引用 — short cross-cutting section (see §6 below).
12. 依赖接口 — what you need from other modules/specs, each marked exists / unmerged / to be built.
13. 错误处理, 测试策略与验收测试 — acceptance tests as numbered, checkable statements.
14. 分期与任务粗估 — phases and a rough task count (tasks of the size used in `docs/superpowers/plans/`).
15. Owner 决策 — numbered `D1…`, each with a default and the consequence of the default.
16. 开放问题.
17. Claude Design 画布待设计清单 — the screens/states a later canvas must cover (owner rule: every page UI is designed on a Claude Design canvas before code).

## 3. Facts about main (verified by the commander on 2026-11-16; re-verify what you rely on)

- Tables present in `supabase/migrations/`: `issuers`, `issuer_securities`, `issuer_identifier_claims`, `issuer_industry_memberships`, `industry_classifications`, `industry_source_memberships`, `industry_metrics`, `industry_metric_runs`, `industry_valuations`, `industry_official_valuations`, `industry_dataset_licenses`, `industry_manifests`, `security_marks` (observation-versioned, in `20261111090000_industry_research.sql`), `financial_facts`, `filings`, `fact_citations`, `company_fact_evidence`, `company_watches`, `issuer_events`, `disclosure_documents`, `document_pages`, `document_citations`, `document_extractions`, `judgments`, `judgment_methodologies`, `judgment_settlements`, `judgment_calibrations`, `macro_series`, `macro_observations`, `macro_snapshots`, `macro_evidence_objects`, `macro_strategy_manifests`, `macro_explanation_runs`, `macro_explanations`, `broker_reports` (older table), `research_theses`, `research_thesis_events`, `research_source_documents`, `research_memos`, `positions`, `trades`, `decisions`, `dq_quarantine`, `dq_freshness`, `dq_eval_runs`.
- Routes: `/macro/*`, `/intel/industries/*`, `/intel/companies`, `/research/*` (private owner tool), `/portfolio/*` (real positions); APIs `api/macro/*`, `api/industries/*`, `api/companies/*`, `api/documents/*`, `api/judgments/*`, `api/quote/*`, `api/copilot`.
- Lib modules: `src/lib/{macro,industry,company,facts,documents,judgments,quotes,evals,dq,entities,agent,llm}`. The macro validated-explanation mechanism lives in `src/lib/macro/explain.ts` and `src/lib/macro/strategy/`, specified in the P3+P4 spec §6.3 (facts rendered by system templates from a frozen fact list; the model only selects facts and writes number-free hypotheses; deterministic validator; claim/finish RPCs; usage accounting).
- Flags in use: `MACRO_STRATEGY_ENABLED`, `MACRO_JUDGMENTS_ENABLED`, `FACTS_CN_ENABLED`, `DOCUMENTS_*_ENABLED`, `NEXT_PUBLIC_COMPANY_JUDGMENTS`, `NEXT_PUBLIC_COMPANY_F3_DRAWER`.
- State: macro live; company serves US facts only (CN values withheld, HK not served, no issuer judgment methodology); industry aggregate/valuation tables are empty in production (official/valuation `deferred_i3`); F4 has one methodology `macro_regime@v2`; F6 `extraction_gold` / `judgment_calibration` kinds disabled; foreign research is unmerged — read it with `git show origin/claude/foreign-research-f63683:<path>` and treat everything in it as "unmerged dependency".
- Copilot: `src/app/api/copilot/route.ts`, tools in `src/lib/agent/tools.ts` (search, quote, financials, kline, dcf, get_portfolio …); it reads none of the new modules.
- Other sessions own macro and foreign research files. Do not edit any file except your own spec.

## 4. Decisions already taken by the commander (use them; do not re-open)

- Route names: 专题研究 `/intel/topics`, 竞争分析 `/intel/peers`, 模拟组合 `/intel/model-portfolio`, 行业数据 `/intel/ai-data`, 他山之石 `/intel/voices`. The private `/research/*` tool and the real `/portfolio/*` keep their paths and tables; nothing in these specs writes to `research_*`, `positions`, `trades` or `decisions`. Check how existing `/intel/*` pages are gated and state the same posture ("public" means the catalogue shared by all entitled users, not anonymous internet access, unless you find otherwise).
- Server flags, all default off: `TOPICS_ENABLED`, `PEERS_ENABLED`, `MODEL_PORTFOLIO_ENABLED`, `AI_DATA_ENABLED`, `VOICES_ENABLED`. Licence-gated publication additionally needs a DB-level publish switch per source/dataset (pattern: foreign research `broker_research_settings`; industry `industry_dataset_licenses`).
- Shared evidence reference. All five modules cite evidence through one tagged shape, `EvidenceRef = { kind, id, as_of, locator? }`, with kinds: `macro_observation`, `industry_metric`, `financial_fact`, `document_citation`, `broker_report_meta` (unmerged), `ai_dataset_observation` (spec 4), `voice_segment` (spec 5), `security_mark`, `judgment`. The topic spec (1) owns the normative definition and the resolver contract (`resolve(ref) → { state, display, source drawer payload }`); specs 2–5 state which kinds they produce and that they implement the resolver for their kinds. A ref that cannot be resolved at `as_of` renders as missing; it is never dropped silently.
- Attachment direction. Topics pull: a topic version holds an ordered list of `EvidenceRef`s. Voices (5) and AI data (4) do not write into topic tables; they expose entity links (`issuer_id`, industry `(scheme, code)`, `topic_slug`) that the topic assembler and the company/industry pages read.
- Price marks. Spec 3 (model portfolio) owns the "replayable price mark" requirement: it evaluates whether `security_marks` on main is sufficient (adjusted close, corporate actions, benchmark index levels, redistribution licence) and specifies the extension if not. Spec 2 (competition) consumes that contract for valuation multiples and ships fundamentals-only until it exists.
- F4 methodology ids reserved: `paper_position@v1` (spec 3), `peer_moat@v1` (spec 2; default is to omit qualitative moat sections in v1), none for specs 1, 4, 5 in v1 unless you can state input snapshot, falsifiable condition and settlement rule.
- LLM text: any model-written summary uses the macro P4 pattern — numbers only from system templates over a frozen fact list, the model writes number-free text, a deterministic validator rejects digits and banned words, every sentence carries evidence refs, usage is metered. No free-form generated numbers anywhere.
- No uncalibrated percentage is shown as a probability; no win rate before settlement and calibration; no investment-advice wording ("买入/卖出/推荐" banned in UI copy and model output for these modules).
- Quote limit for third-party text (broker PDFs, podcasts, interviews): short quoted fragments only, default ≤ 120 Chinese characters or ≤ 60 English words per fragment and ≤ 3 fragments per item, always attributed and linked; full transcripts or full text only where the publisher's licence explicitly allows redistribution. These numbers are an owner decision default — list them as such.
- zh/en for every string; every chart has a table equivalent; tokens from `DESIGN.md` / `globals.css` only.

## 5. Licence research rule

Where your spec names an external source, fetch its terms page yourself (WebFetch / WebSearch) and cite the URL and the clause. If you could not read a terms page, write "未能读取（日期，原因）" — do not paraphrase from memory and do not invent clauses. A source whose terms were not read, forbid redistribution, or are a broker's proprietary table defaults to **excluded** or **private-only**, with licence confirmation as an owner decision. Record the fetch date (2026-11-16).

## 6. Copilot section (same shape in all five)

State: the tool name(s) to add later in `src/lib/agent/tools.ts` (`topic_dossier`, `peer_compare`, `model_portfolio`, `ai_dataset`, `voices_search`), their inputs, that the tool returns only served-state data with `EvidenceRef`s and `as_of`, that the Copilot must render numbers verbatim from tool output with citations and say "missing/withheld" when the tool does, that private-only content (PDF text, non-licensed transcripts) never enters the tool output, and that the tool is behind the module flag. No implementation now.

## 7. What you return to the commander

A short message: the spec path, character count, the owner-decision list (id, one line, default), the rough task count, the dependencies on other specs, and anything you could not verify. Do not commit.
