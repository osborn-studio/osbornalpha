# CN source verification (Task 8)

Recorded: 2026-11-07T02:41:06.458Z · AKShare 1.20.35 · pandas 3.1.1 · Python 3.12.13
Command: `scripts/macro/.venv/bin/python scripts/macro/collect.py --mode daily --record-fixtures src/lib/macro/fixtures/cn`

| series | AKShare call (from cn-series.json) | evidence URL (host) | bytes | sha256 (12) | claims | located in bytes | outcome |
|---|---|---|---|---|---|---|---|
| CN_CPI_INDEX | macro_china_nbs_nation(kind='月度数据', path='价格指数 > 居民消费价格分类指数(上年同月=100) > 全国居民消费价格分类指数(上年同月=100)(2026-)', period='LAST13') | https://data.stats.gov.cn/dg/website/publicrelease/web/external/stream/esData | 82868 | 69216e8ef8d0 | 9 | 9 | verified |
| CN_PPI_INDEX | macro_china_nbs_nation(kind='月度数据', path='价格指数 > 工业生产者出厂价格分类指数 > 工业生产者出厂价格指数(上年同月=100)', period='LAST13') | https://data.stats.gov.cn/dg/website/publicrelease/web/external/stream/esData | 22450 | 30f50c4d1e52 | 12 | 12 | verified |
| CN_PMI_MFG | macro_china_nbs_nation(kind='月度数据', path='采购经理指数 > 制造业采购经理指数', period='LAST13') | https://data.stats.gov.cn/dg/website/publicrelease/web/external/stream/esData | 102541 | d44657d7682f | 13 | 13 | verified |
| CN_GDP_INDEX | macro_china_nbs_nation(kind='季度数据', path='国民经济核算 > 国内生产总值指数', period='LAST8') | https://data.stats.gov.cn/dg/website/publicrelease/web/external/stream/esData | 149158 | cae08b7943cc | 8 | 8 | verified |
| CN_M2_YOY | macro_china_nbs_nation(kind='月度数据', path='金融 > 货币供应量', period='LAST13') | https://data.stats.gov.cn/dg/website/publicrelease/web/external/stream/esData | 45106 | e144c9939d84 | 12 | 12 | verified |
| CN_EXPORT_YOY | macro_china_nbs_nation(kind='月度数据', path='对外经济 > 货物进出口总额', period='LAST13') | https://data.stats.gov.cn/dg/website/publicrelease/web/external/stream/esData | 101195 | 60b968182b0b | 12 | 12 | verified |
| CN_CGB_10Y_D | bond_china_yield(start_date, end_date) window 45 d, curve '中债国债收益率曲线', column '10年' | https://yield.chinabond.com.cn/cbweb-pbc-web/pbc/historyQuery | 35090 | 727350f408af | 29 | 29 | verified |
| CN_USDCNY_CP_D | currency_boc_safe() column '美元' | https://www.safe.gov.cn/AppStructured/hlw/RMBQuery.do | 525478 | ec5144b975e3 | 263 | 203 | verified (60 pre-HTML claims from XLSX, not located) |

Other responses fetched by the calls (not evidence):
- https://data.stats.gov.cn/dg/website/page.html#/pc/national/monthData (HTTP 200, text/html)
- https://data.stats.gov.cn/dg/website/publicrelease/web/external/new/queryIndexTreeAsync (HTTP 200, application/json;charset=UTF-8)
- https://data.stats.gov.cn/dg/website/publicrelease/web/external/new/queryIndicatorsByCid (HTTP 200, application/json;charset=UTF-8)
- https://www.safe.gov.cn/safe/2020/1218/17833.html (HTTP 200, text/html)
- https://www.safe.gov.cn/safe/file/file/20260106/0f147e5357eb4c12a6406fc575cc21e8.xlsx (HTTP 200, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)

Notes: CN_USDCNY_CP_D history before 2026-01-05 exists only in the SAFE XLSX, which is not evidence (no XLSX locator or bucket MIME); history starts at 2026-01-05. The 60 unlocated claims are exactly 2025-10-09 to 2025-12-31. The ChinaBond evidence URL carries a query string (startDate, endDate, gjqx, qxId, locale); the path matches `/cbweb-pbc-web/pbc/historyQuery`.
