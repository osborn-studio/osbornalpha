# Codex round-2 findings: disposition (architect decisions)

Source: `01-codex-spec-audit-round1.md` (round 1, 31 findings), Codex round 2 (25 new findings N1–N25, verdict "not ready"). Decisions below are the architect's (Fable 5.1); items marked **owner** need the owner's call. The 3rd draft of the spec implements every ACCEPT.

| # | Decision | Reason / how |
|---|---|---|
| N1 SQL vs prose mapping order | ACCEPT | §5.2 SQL rewritten: per filing the row set is `mapping_gen = filings.mapping_gen`; ordering is then by `available_date` only. |
| N2 lexical mapping version | ACCEPT | `mapping_gen int` (monotonic) replaces text ordering; `filings.mapping_gen` records the generation that fully processed the filing; reads use only rows of that generation, so dropped concepts disappear. `mapping_version` text kept for humans. |
| N3 same-day report-type order | ACCEPT | Same `available_date` + same K + different values from different synthetic CN filings → both rows quarantined `same_day_conflict`; equal values kept. No chronology is invented from report-type strings. |
| N4 filings mutable / direct `ok` insert | ACCEPT | Triggers: facts insert must be `staged`; `available_date` must equal the filing's; filings update limited to `document_ref/document_url/link_attempts/mapping_gen`. |
| N5 lease fencing | ACCEPT | Lease token = batch id; `publish_staged_facts` and cleanup require the live lease (`lease_batch_id = p_batch and lease_until > now()`), release is ownership-checked, claim by the same batch renews. |
| N6 crash recovery around quarantine | ACCEPT | Quarantine items written before status flips; cleanup deletes `staged` **and** `quarantined` rows of unpublished dead batches (trigger allows delete for non-`ok` rows); hook resolves by natural key and ignores vanished rows. |
| N7 paginated read vs publish | ACCEPT WITH LIMIT | Reads are one request per (issuer, concept) (≤1000 rows each, which covers 10 years × ~3 disclosures); cross-concept reads may miss a disclosure published mid-read but never see a corrupt state (old disclosures are never removed). Documented as an accepted limit in §5.4. |
| N8 decimal fidelity | ACCEPT (persist) / DECLINE (exact arithmetic) | Numbers are extracted from the raw JSON text as decimal strings (numbers-as-strings parser, tested with 20-digit integers) and inserted as strings into `numeric`; rules and derivation use doubles with stated 15-significant-digit precision and tolerance-based identities. Exact decimal arithmetic is not needed for 0.5% tolerances or ratios. |
| N9 basis mixing | ACCEPT | `net_change_in_cash` split (excl. / incl. restricted cash); CN capex becomes `capex_incl_intangibles`; `fcf` definition is market-specific and the metric row carries `basis`. Fallback lists restricted to equivalent aliases. |
| N10 CN facts public before document evidence | **owner** (default: publish with `citation` state) | Owner decided Tushare as the A-share source with exchange reports as upstream; plan 3 reconciles against cninfo PDFs (gold set). The spec publishes CN facts with `citation: 'pending'|'linked'` and exposes unlinked counts; keeping CN facts private until PDF-verified would make the A-share side unusable until plan 3. Owner may choose the stricter policy (§14). |
| N11 cninfo matching | ACCEPT | Title must contain the report year and kind; exclusions; uniqueness after inspecting all pages; `link_attempts` with retry for existing filings; BJ excluded (collector supports SH/SZ only). |
| N12 metric generations | ACCEPT | `replace_financial_metrics(issuer, rows jsonb)` SQL function: advisory lock + delete + insert in one transaction. |
| N13 multi-currency ratio collision | ACCEPT | `input_unit` in the metrics primary key. |
| N14 YTD differencing across filings | DECLINE | Requiring single-filing operands removes almost every derived quarter (a 10-Q never restates the previous YTD). Operands are the latest visible disclosures at `asOf`; `inputs` lists both filings so the mix is replayable. Recorded as a known property in §8. |
| N15 exact intervals and lineage | ACCEPT | Quarter start = subtrahend end + 1 day; YoY = same duration and nearest period_end within 350–380 days (ambiguous → omit); ROE opening = instant at window start − 1 day exactly; lineage flattened to facts; derive loads all facts of the issuer for the needed concepts. |
| N16 quarantine association | ACCEPT | Hook selects rows by natural key stored in `payload` (not by ids); only `quarantined` rows are promoted; retries idempotent. |
| N17 no-op acceptance, signatures | ACCEPT | Acknowledgement vs promotion stated; `identityRule(ruleId, …)` signatures; batch-wide aggregation stated. |
| N18 due eligibility | ACCEPT | Select `next_due_at <= now()`; tie-break `issuer_id`; explicit timestamp updates. |
| N19 dual feed | ACCEPT | `fact_sync_scope` primary key `(issuer_id, market)`. |
| N20 deadline propagation | ACCEPT | `deadline` in `SyncDeps`; an issuer starts only with ≥ 90 s left; fetch timeouts and retries bounded by remaining time. |
| N21 coverage check | ACCEPT | `coverage_summary` becomes informational (no listing-date inference). |
| N22 db contract | ACCEPT | `FactsDb` interface (lease, cleanup, publish, replace metrics, ranged paged reads, insertMany, status updates) with Supabase RPC / memory / pg implementations; `security definer` written in the SQL. |
| N23 freshness/idle | ACCEPT | Idle run (nothing due) is a successful heartbeat; `deadline_hit` as an informational error entry. |
| N24 caching/citation | ACCEPT (partial) | Historical responses cached 1 h; rows carry applied `mappingGen`, top level the active one; metrics inputs carry filing ids and dates, evidence via facts endpoint `history=1`. |
| N25 CI gates | ACCEPT | CN integration file exists only together with fixtures (harness requires every DB suite to be critical); CN cron entry is added only after CN fixtures and gold assertions pass; fixtures for all six gold issuers. |
| Round-1 #29 private cohort drives public coverage | **owner** | A-share coverage = owner's in_scope cohort; owner accepts that the cohort is inferable from public coverage, or chooses a public universe (quota cost) — §14. |
| Round-1 #27 Tushare pagination semantics | OPEN (verify) | Recorded in §15; F2-4 first step. |
