# Chinese industry research on Gildata data — research, specification draft, design brief

2026-11-20. Documents only; no product code. Background: the owner decided on 2026-11-20 that
the Chinese side of industry research (`/intel/industries`, Shenwan classification) may use
Hengsheng Juyuan (恒生聚源, Gildata) as a licensed vendor source, as an exception to "primary
sources only". The other mandate rules stand.

| File | Content |
|---|---|
| [01-competitor-section.md](01-competitor-section.md) | What chaosaiagent.com `/industries` shows, how, and its defects |
| [02-gildata-capabilities.md](02-gildata-capabilities.md) | What Gildata's public pages document, what only third parties say, what is unknown; terms; questions |
| [03-mapping.md](03-mapping.md) | Each element → vendor, our foundation, our computation, judgment, or not built; replay and source display |
| [04-spec.md](04-spec.md) | First-release specification draft, phased PRs, owner decisions |
| [05-design-brief.md](05-design-brief.md) | Brief for the Claude Design canvas |

## Summary

1. The competitor page has four data modules on the 31 Shenwan level-1 industries (financial
   heatmap, lifecycle stage groups, prosperity radar, valuation percentiles) and three
   editorial modules on 106 hand-picked sub-industries. Only the first four are in scope.
2. Their lifecycle stage is their own rule (three 3-year revenue CAGRs) plus an unlisted
   editorial override; it is not a vendor field. Their radar uses a placeholder and a proxy.
3. The Gildata product with self-service registration and a key is 数据地图 MCP. Its public page
   lists industry constituents, industry-level financial analysis, index valuation and an
   industry prosperity indicator. No lifecycle field is documented.
4. No public reference manual exists. Interface names and the call shape (a free-text query per
   interface) are known only from third-party pages and need verification with the key.
5. The public service agreement for personal accounts limits use to the account holder and bars
   providing data to third parties. Public display is therefore not allowed under those terms;
   everything vendor-sourced or vendor-derived is admin-only until the owner has terms that
   allow it.
6. Unknown without the key or contract: Shenwan version, constituent history, point-in-time
   data, history depth, aggregation method, quotas, price, response determinism.
7. First release: store raw responses byte-exact, show vendor-reported aggregates labelled as
   such, compute CAGRs and percentiles ourselves, reuse the existing `sw2021` scheme, licence
   table, run and generation pattern, detail and constituents pages.
8. Stage, composite prosperity and valuation verdict are judgments: registered, versioned
   methods under `src/lib/judgments`, shown apart from facts, no number until calibrated.
9. Our own 整体法 aggregation over company statements is release 2; it is the path that meets
   "explicit aggregation over then-current constituents".
10. First three build PRs: key probe and verification report; vendor raw store and client;
    classification and membership into the existing tables.
