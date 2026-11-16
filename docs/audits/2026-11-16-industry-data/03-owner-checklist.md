# Industry data — owner checklist (2026-11-16)

Each item: what you are deciding, what exactly to confirm, and what happens next. Nothing below has been run
against production. Terms were read on 2026-11-16; the clauses are quoted in `01-diagnosis.md` §4.

Commands assume a production env file outside the repository (`<prod.env>`, from `vercel env pull`) and the Tushare
token file `~/.config/osbornalpha/secrets.env`:

```sh
RUN='node --env-file=<prod.env> --env-file="$HOME/.config/osbornalpha/secrets.env" --import tsx scripts/industry/sync.ts'
```

Every command is a dry run until `--apply` is added.

## A — rights to SW2021 and Tushare-relayed data

**Terms that apply**

- Tushare 服务协议 (`https://tushare.pro/document/1?doc_id=405`) 二.(1): no use "以营利、经营等非个人使用的目的";
  二.5: the licence is "个人的、不可转让的、非商业用途的 … 仅可用作个人查看使用".
- SW Research (`https://www.swsresearch.com/institute_sw/allIndex/releasedIndex`): "版权所有 上海申银万国证券研究所
  有限公司"; no published redistribution terms.

**Two separate confirmations**

| # | Confirm | If yes | If no |
|---|---|---|---|
| A1 | *Storage.* Tushare-relayed SW2021 classification, constituents, `stock_basic` listings and `daily_basic` marks may be **stored in production as `internal`** (visible to the service role and to an admin preview only) under the account you hold | run the loads below; the public site keeps showing nothing from them | nothing is loaded; SW/CN stays empty |
| A2 | *Public display.* You hold written permission — a Tushare commercial/institutional agreement that replaces 二.5, **and** SW Research's permission (or a vendor contract that includes it) for classification names, constituents and index valuations | switch the licence per dataset (below) and record the document, signer and date in the PR | datasets stay `internal`; the SW tab keeps the "unlicensed" state |

**After A1**

```sh
$RUN --job load-a-share                 # dry run: candidates / skipped / rejected
$RUN --job load-a-share --apply         # A-share issuers + delisting evidence (≈5,579 active tickers; cninfo lookups)
$RUN --job memberships-sw               # dry run: source plan
$RUN --job memberships-sw --apply       # SW2021 tree (expect 31/134/346), source records, resolution
```

**After A2** (admin session, same-origin JSON; one call per dataset, each writes the audit log):

```
POST /api/admin/industries/licenses  {"dataset_key":"scheme:sw2021:2021","status":"public","note":"<document, signer, date>"}
```

`marks:tushare-daily_basic` and `official:tushare-sw_daily` are reviewed separately and only matter once H is decided.

## E — A-share facts universe

**Confirm:** the CN facts scope may grow from the research cohort to every SW2021 member plus every active A-share
(about 5,600 issuers; Tushare call volume and storage grow accordingly). Needs A1 first (the universe is read from
the SW source records).

**Then:** set `FACTS_CN_INDUSTRY_UNIVERSE=1` in Vercel (commander applies it on your yes), redeploy, and

```sh
$RUN --job facts-scope                  # dry run: industry_universe count and skip reasons
FACTS_CN_INDUSTRY_UNIVERSE=1 $RUN --job facts-scope --apply
```

## CN publication

**Confirm all three:**

1. CN facts may be public at all given the Tushare clause above (same A2 question, for `financial_facts` of market
   `CN`), or a primary-source feed replaces Tushare for publication.
2. The CN gold set is transcribed (48 pending templates, `docs/runbooks/cn-gold-transcription.md`) and passes.
3. `FACTS_CN_ENABLED=1` may be set for the aggregate job.

**Then:** after the CN facts worker has filled the universe (readiness gate: ≥ 95 % of the industry facts universe with
a successful sync — the run fails with `facts_scope_not_ready` otherwise):

```sh
$RUN --job aggregate                    # dry run (new in this change): cells that would publish, nothing written
FACTS_CN_ENABLED=1 $RUN --job aggregate --apply
```

## H — valuation comparator

**Confirm one** (options and evidence: `docs/audits/2026-11-07-industry-closeout.md`):

- **H(a)** add a separate metric `pe_ttm_sw` that follows the SW algorithm (free-float weighted, SW quarterly calendar,
  loss-makers kept in the numerator). You must sign off the formula details listed there: new listings before the sixth
  trading day, suspended/delisted stocks, negative earnings, negative equity, samples ≤ 5.
- **H(b)** keep the house whole-method PE with no official anchor; it is then never published under the current gate.

Known evidence either way: PB basis deviates 1.1–4.4 % (not eligible), the house bank PE is off about 17 %, and the
reconciliation gate (≥ 24 pairs, ≥ 90 % coverage, ≥ 95 % within 1 % per series) has 2 industries × 5 days.

**Then:** no command. A spec revision of §6.3/§6.4 and a separate I-3 plan follow; `official` and `valuation` keep
answering `deferred_i3` until that plan ships.

## C — publishing valuations / restricted series

**Confirm:** whether any valuation series may be public once H and A2 are settled. Default stays "not published".
No command until I-3 exists.

## US aggregates (this change set) — what you approve by merging

- Spec amendment A1 (§19): US SIC industries are aggregated from EDGAR facts using **the constituents as of the run
  date**, applied to the last three completed fiscal-year buckets, labelled "reconstruction" on every surface. It is not
  historical membership.
- One additive migration, one new weekly cron entry (`aggregate-sic`), no environment flag.
- After merge: migration applied, exact `origin/main` deployed, first load by script, verification in
  `02-verification.md`.
