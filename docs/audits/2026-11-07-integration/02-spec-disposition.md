# Integration spec — mmx audit disposition (2026-11-07)

Audit: `01-spec-mmx.md` (MiniMax-M3, one round, input = task + spec draft 1). Commander: Opus 5.5.

| ID | Disposition | Where it lands |
|---|---|---|
| AUD-01 | Accept. P3/P4 `f4-client.ts` must fail closed on missing/empty `inputs[].snapshot`, `ref`, settlement evidence. | PR A1 (macro consumer hardening, now, main) |
| AUD-02 | Accept. `classifyAsOf` must only see batches finalized at or before the cutoff. | PR A1 |
| AUD-03 | Accept. `macro_regime@v1` publishable=false blocks `MACRO_JUDGMENTS_ENABLED`; enable gate includes licence check. | PR A2 (after F4 lands); owner Q1 |
| AUD-04 | Accept. Company must render F4's exported `JudgmentCard`, not a local copy. | PR C (after F4 + #115) |
| AUD-05 | Accept as blocker. F3 has no DB-free `extractDocument`/`sliceText` export; docs→foreign not integrable until foreign runtime exists and F3 exports it. | PR E (deferred) |
| AUD-06 | Accept, with correction: F3 has `disclosure_documents.filing_source_ref` (20261117090000_disclosure_documents.sql:51) — an exact key to `filings.source_ref`; `filing_documents` is HK-only. PR D resolves filing → document by `(source, filing_source_ref)` exact match, never by ticker recency; ambiguity → no drawer. | PR D (now, stacked on #114 + #115) |
| AUD-07 | Accept. Whitelist `industry_metrics` (industry_valuations stays rejected until I-3). | PR B (after F4) |
| AUD-08 | Accept. No industry/company methodology in F4 registry → `INDUSTRY_JUDGMENTS_ENABLED`, `NEXT_PUBLIC_COMPANY_JUDGMENTS` stay off; no fixture methods. | PR B/C; owner Q2 |
| AUD-09 | Accept. F6 `judgment_calibration` stays disabled; categorical regime scores are never mapped to `p`. | PR G |
| AUD-10 | Accept. One parser, `'1'` only, shared by macro and F4. Macro side in PR A1 (`src/lib/macro/flags.ts`), F4 `deps.ts` switched in PR A2. | PR A1/A2 |
| AUD-11 | Accept. Company parses F4 route through F4's exported types + real-route contract test, fail closed. | PR C |
| AUD-12 | Accept. Real-route parameter matrix test in PR A2/B. | PR A2/B |
| AUD-13 | Accept. Broker flags listed as "planned, no read site". | spec §1 (already says so) |
| AUD-14 | Accept. `NEXT_PUBLIC_SITE_URL` is deployment config; PR A1 asserts absolute https/same-origin shape and never takes it from a request. | PR A1 |
| AUD-15 | Accept as PR E requirement (shared code-point `sliceText` contract test). | PR E |
| AUD-16 | Accept. Client distinguishes unsettled (`settlements:[]`) from settled-with-broken-evidence (unavailable). | PR A1 |
| AUD-17 | Accept. Merge rule: union of `criticalSuites`, inventory check after every merge. | all merges |
| AUD-18 | Accept. Spec §1 already marks F6 kinds as registry entries, not env vars. | — |
