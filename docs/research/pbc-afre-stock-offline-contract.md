# PBOC AFRE stock YoY offline candidate

Checked 2026-11-08 (Asia/Shanghai). Depends on the source findings in [research PR182](https://github.com/osborn-studio/osbornalpha/pull/182); no code dependency on that PR. No new packages.

## Verified source and boundary

[Official August 2025 article](https://www.pbc.gov.cn/goutongjiaoliu/113456/113469/5837468/index.html) reports month-end aggregate financing **stock**, with publisher-comparable YoY of 8.8 percent. Publication is 2025-09-12; observation period ends 2025-08-31. A live ordinary GET on 2026-11-08 and local parse reproduced SHA-256 `dba2e5c43c1d3839f8f196cb280ea8c77553d385affe6079dbc075d02b7fafd4` and 8.8. Full article bytes remain in task scratch, outside the repository.

The [PBOC notice](https://www.pbc.gov.cn/rmyh/109345/index.html) reserves rights unless specially marked, discusses downloading/use by permitted media/websites with attribution, and reserves modification rights. This candidate establishes technical feasibility from a minimal factual test excerpt and synthetic envelope; it does **not** establish commercial redistribution permission or a prohibition on reusing statistical facts. Intended-use clearance remains unresolved. No large publisher body is shipped.

Live community search and pinned [AKShare implementation](https://github.com/akfamily/akshare/blob/a6ab0d4ccb9858683396bd1b1ed8fbc80cb2f450/akshare/macro/macro_china.py#L257) confirm `macro_china_shrzgm` retrieves MOFCOM **incremental flow**, not outstanding stock YoY. It is not used. Neither IPMAN nor any other definition is substituted for existing IDs.

## Parser contract

`parsePbcAfreStockArticle` is a standalone offline function, intentionally absent from the active registry and all collectors. It accepts fatal UTF-8 bytes (1–262144 bytes) and a caller-supplied receipt. The exact verified HTTPS article URL is allowlisted; no redirects, network fetch or arbitrary source IDs are accepted. The caller must establish that bytes came from that URL; receipt validation is not network authenticity verification.

The function requires unique ArticleTitle/PubDate metadata, the verified August 2025 title, a valid publication date after period end and no later than retrieval's UTC date, and exactly one headline paragraph. A strict headline grammar binds period, total stock in 万亿元 and an explicit published percent growth/decline. All paragraph bodies must be plain text; any entity or inline markup is rejected to avoid concealed duplicate headlines. Unsupported layout, encoded/inline headline markup, missing values, wrong units, flow titles, mismatched months or duplicate candidates throw. Comments/scripts/styles are masked while preserving character offsets. This deliberately narrow grammar is not a general HTML parser or historical archive contract.

Output is a research candidate, **not** `ParsedPoint`/`ObservationWrite`: fixed series ID, month end, canonical decimal percent text (8.8, not 0.088), unit, `revisable: true`, publication date, retrieval timestamp, source URL, parser version, full-byte SHA-256 and UTF-16 value range into the decoded evidence. The range is not an ingest Locator. Never recompute growth from rounded stock balances. A changed value yields changed evidence; no observation version or automatic supersession is assigned. Published date never substitutes for first-seen availability.

## Acceptance and remaining dependencies

Tests cover the factual fixture, component decoys, rounding independence, corrected values, negative growth, provenance/ranges, malformed metadata/period/unit/encoding/size, ambiguity, and unchanged missing catalog/registry status. Live article replay independently checks the synthetic envelope against real bytes.

Before broader history or runtime use: verify additional official article shapes/archive coverage and correction policy; resolve intended-use/access/attribution terms; add an authorized collector, durable raw evidence and ingest locator support with first-seen revision/quarantine tests. Parent coordinates any catalog/methodology registration change and isolated DB rehearsal, production/browser acceptance and deployment. `CN_AFRE_STOCK_YOY` remains missing; this PR fills parser feasibility only.
