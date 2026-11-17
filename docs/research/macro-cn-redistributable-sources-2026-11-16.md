# Redistributable official sources for LPR, 社融存量同比 and MLF — 2026-11-16

Owner decision (2026-11-16): do not pursue CFETS / PBOC authorization; find official sources whose terms already allow redistribution. All terms below were read on 2026-11-16 (Asia/Shanghai) from the cited pages; quotations are the operative clauses. Mandate unchanged: primary or official publishers only, no aggregator or media relay as source of record, and a definition mismatch keeps a row missing rather than filling it with a proxy.

## Verdicts

| Catalog row | Verdict | Source of record | Why |
|---|---|---|---|
| `CN_LPR_1Y` (monthly, weight 10) | **Use BIS** | BIS central bank policy rates, China, monthly, end of period (`WS_CBPOL`, key `M.CN`) | BIS states the series **is** the 1-year LPR from 2019-08-20; terms permit unrestricted use with citation; machine-readable CSV; values verified |
| `CN_LPR_1Y_Q` (quote-date events) | **Not available** | none | BIS daily series is a forward-filled level and stamps changes on the 20th even when the quote was deferred (shows 2022-08-20 and 2023-08-20, both weekend days; real quotes were 08-22 and 08-21), so it cannot give quote dates. Row is not created |
| `CN_LPR_5Y` (weight 0) | **Stays out** | none | Only CFETS and PBOC publish it; BIS carries the 1-year tenor only. Not added to the catalog |
| `CN_AFRE_STOCK_YOY` (weight 20) | **Stays missing** | none clean | PBOC is the only publisher of the monthly stock growth rate and its notice does not grant reuse; gov.cn relay forbids commercial republication; NBS has no monthly series; BIS credit statistics are a different quantity |
| `CN_MLF_1Y` (weight 10) | **Stays missing** | none | No single MLF rate exists since March 2025 (multiple-price awards); earlier rates are prose on pbc.gov.cn under the same PBOC notice |

Net effect on the CN regime: coverage gains weight 10 (LPR 1Y); weights 20 (社融) and 10 (MLF) remain uncovered and stay in the denominator.

## Candidates and terms, per publisher

### BIS (Bank for International Settlements) — clean

- Terms: "Terms of permitted use of BIS statistics", https://data.bis.org/help/legal — "The use of the statistics is unrestricted, provided that: if the statistics are reproduced, the BIS must be cited in your publication or product as the source of the statistics; … your use of the statistics must not be potentially misleading, for example by implying endorsement …; if the statistics will be used in a commercial publication or product, their inclusion in the publication or product will not result in any additional charge to subscribers or other users; … nothing in these statistics shall be construed as containing any investment recommendation or advice." API terms on the same page: provided as-is, BIS may limit or suspend access, use the current API version.
- **Owner point (O-BIS):** OsbornAlpha has paid plans. The condition is that including BIS statistics causes no *additional* charge. Confirm that the macro workbench data is not a separately charged add-on (it is available on the same terms to all users of the page).
- Series: `https://stats.bis.org/api/v2/data/dataflow/BIS/WS_CBPOL/1.0/M.CN?startPeriod=2019-01&format=csv` → HTTP 200, `text/csv;charset=UTF-8`, 94 rows on 2026-11-16 (sha256 `23cc70f4…17d4e` for that retrieval). Columns include `COMPILATION` = "From 20 Aug 2019 onwards: Loan Prime Rate (1 year): from 1 Jan 1996 till 19 Aug 2019: Official lending rate (1 year).", `SOURCE_REF` = "People's Bank of China", `TITLE` = "Central bank policy rates - China - Monthly - End of period", `TIME_PERIOD`, `OBS_VALUE`, `OBS_STATUS` A, `OBS_CONF` F (free).
- Definition match: catalog `CN_LPR_1Y` = 1-year LPR, monthly; the plan's monthly rule was "last quote of the month", which equals BIS "end of period". Checked against the CFETS values recorded on 2026-11-07: 2019-08 4.25, 2019-09 4.20, 2019-11 4.15, 2020-02 4.05, 2020-04 3.85, 2021-12 3.80, 2022-01 3.70, 2022-08 3.65, 2023-06 3.55, 2023-08 3.45, 2024-07 3.35, 2024-10 3.10, 2025-05 3.00, 2026-10 3.00 — identical.
- Definition break to enforce: periods before 2019-08 are the **benchmark lending rate**, a different instrument. The parser must drop `TIME_PERIOD < 2019-08` and must fail closed if `COMPILATION` no longer contains "From 20 Aug 2019 onwards: Loan Prime Rate (1 year)" (BIS changing the underlying rate must stop ingestion, not silently change the series).
- History depth: 2019-08 onward (87 months). Machine-readability: SDMX CSV, existing `csv_row` locator works. Update lag: the daily file ran to 2026-11-10 on 2026-11-16 (about a week); the monthly value for October was present. So a month's value is available roughly one to two weeks after the 20th; catalog `releaseLagDays` should be set from this (proposed 10 after month end, to be confirmed by a few weeks of first-seen timestamps).
- Not usable from BIS: 5-year LPR (absent); quote dates (see verdict table); 社融 (BIS "total credit to the non-financial sector" is quarterly, covers different instruments and sectors, and is not the PBOC aggregate — no substitution).

### PBOC (pbc.gov.cn) — not clean

- Notice: https://www.pbc.gov.cn/rmyh/109345/index.html — "1. 本网所有资料，凡未经特殊注明的，版权均属中国人民银行所有。已经中国人民银行许可的媒体、网站，在下载使用时必须注明"稿件来源：中国人民银行网站"… 2. 本网属于政府机构网站，未经中国人民银行许可，其它商业性网站不得链接本网…".
- Reading: reuse is described only for media and websites already permitted by PBOC; commercial sites may not even link without permission. This covers the LPR announcement pages (货币政策司 › 利率政策 › LPR), the MLF tender announcements and the 调查统计司 stock tables alike. No open-licence marking was found on those pages. Without authorization (which the owner has ruled out) PBOC pages cannot be the source of record.

### CFETS / chinamoney — not clean

- https://www.chinamoney.org.cn/chinese/legaldeclaration/ §1: no reproduction, distribution or acquisition "通过硬拷贝或电子抓取系统" without written authorization. Ruled out.

### gov.cn (State Council portal) — not clean

- 网站声明, https://www.gov.cn/home/2014-02/23/content_5046258.htm — "任何媒体、互联网站和商业机构不得利用本网站发布的内容进行商业性的原版原式地转载… 任何媒体或互联网站不得擅自转载本网站由其他单位提供的信息和服务内容，如需转载，必须与相应提供单位直接联系获得合法授权。"
- It does relay the PBOC monthly stock report (example: https://app.www.gov.cn/govdata/gov/202509/12/536584/article.html, source line "中国人民银行网站"), but the statement sends reuse of relayed content back to the provider, i.e. PBOC. Not a way around the PBOC notice.

### NBS (data.stats.gov.cn) — clean terms, but does not carry the series

- Terms: https://www.stats.gov.cn/wzgl/202302/t20230217_1912857.html — "欢迎转载或引用本网所载内容" with exceptions (third-party content, marked items), attribution required, and "用户可以在本网站下载和使用国家统计局发布的统计数据".
- Walked the public data tree on 2026-11-16: 月度数据 › 金融 has a single leaf, 货币供应量 (the M2 series already in use). No LPR, no MLF, no 社会融资规模. 年度数据 › 金融业 has "社会融资规模及构成", which is **annual** and not the monthly stock growth rate. So NBS cannot supply any of the three rows.

### International mirrors checked

- FRED: no LPR series found. `IRSTCB01CNM156N` (OECD "immediate rates: central bank rates" for China) returns 2.90 for early 2019, which is a different rate (not LPR, not the benchmark lending rate); not used.
- IMF IFS: the SDMX host did not resolve from this machine; not verified. Its China policy/lending-rate lines are historically the benchmark lending rate, so even if reachable it is not expected to match the LPR definition. Not relied on.
- OECD: not separately checked beyond the FRED relay above.

## What the owner would confirm

1. **O-BIS** — the "no additional charge" condition above, and the attribution line "Source: BIS central bank policy rates (People's Bank of China data)".
2. `docs/methodologies/licenses.json`: the existing keys `macro_observation×macro_workbench` and `macro_snapshot×macro_workbench` name the covered sources in their `evidence` text and currently say "Not covered: … CN_LPR_1Y …". When `CN_LPR_1Y` is activated the owner re-confirms and the evidence text gains "CN_LPR_1Y via BIS WS_CBPOL under https://data.bis.org/help/legal". No new key is needed (origins are per module, not per source). `licenses.json` is outside every formula hash.
3. Accept that 社融存量同比 and MLF stay missing with the stated reasons (catalog reason texts will say so), unless the owner later decides that reproducing a published statistical figure with attribution is acceptable under the PBOC notice. That is a legal judgment I have not made.

## Implementation consequence (draft PR-3b)

- New adapter for BIS SDMX CSV (fetch host `stats.bis.org`, server-side like FRED, no collector on the Mac), parser with the definition guard, recorded fixture of the `M.CN` response.
- Catalog: `CN_LPR_1Y` becomes `active` with the BIS source, native monthly (no derive, no `_Q` rows), `firstPeriod` 2019-08-31; `CN_AFRE_STOCK_YOY` and `CN_MLF_1Y` stay `missing` with updated reasons; no `CN_LPR_5Y` row. This is the single catalog change → `macro_regime@v3`.
- The CFETS/PBOC parsers from PR #228 stay offline research code (useful only if authorization is ever obtained); the dormant collector branches remain unreachable.
