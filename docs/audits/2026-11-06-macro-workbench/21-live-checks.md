# 宏观工作台实况检查（Task 18，2026-11-06）

环境：本机，无数据库写入、无生产访问。Python 3.12.13，AKShare 1.20.35，FRED CSV 直连。

## 1. FRED：经代码路径抓取并解析全部 active 序列（零写入）

方法：scratch `tsx` 脚本调用 `collectableOf('fred_csv')` → `fetchFredCsv(seriesKey,{cosd:'2000-01-01'})` → `parseFredCsv`，不触碰任何数据库、存证或路由。

```
series_id | fred_code | http | points | first | last | last value_text | bytes
US_FEDFUNDS_EFF_D | DFF | 200 | 9806 | 2000-01-01 | 2026-11-05 | 3.88 | 156917
US_FED_TARGET_UPPER_D | DFEDTARU | 200 | 6535 | 2008-12-16 | 2026-11-06 | 4 | 104586
US_FED_TARGET_LOWER_D | DFEDTARL | 200 | 6535 | 2008-12-16 | 2026-11-06 | 3.75 | 104586
US_DGS10_D | DGS10 | 200 | 6715 | 2000-01-03 | 2026-11-05 | 4.84 | 110931
US_DTWEXBGS_D | DTWEXBGS | 200 | 5222 | 2006-01-02 | 2026-10-30 | 121.6656 | 104929
US_CPI_INDEX | CPIAUCSL | 200 | 320 | 2000-01-31 | 2026-09-30 | 336.298 | 6118
US_UNRATE | UNRATE | 200 | 321 | 2000-01-31 | 2026-10-31 | 4.1 | 4856
US_PPI_FD_INDEX | PPIFIS | 200 | 203 | 2009-11-30 | 2026-09-30 | 159.78 | 3881
US_WTI_D | DCOILWTICO | 200 | 6352 | 2000-01-04 | 2026-11-03 | 99.64 | 116374
active FRED series: 9; failures/empty: 0
```

9 / 9 个 active FRED 序列 HTTP 200、解析点数 > 0、无解析错误。最新值为 CSV 文本原样（如 UNRATE 最新 `4.1`、DGS10 `4.84`）。

## 2. AKShare：`collect.py --mode backfill --dry-run <dir>`（真实上游，不 POST）

命令：`scripts/macro/.venv/bin/python scripts/macro/collect.py --mode backfill --dry-run <scratch dir>`；耗时约 3 分 21 秒；退出码 0；写出 `start.json`、`chunk-000..003.json`（每块 < 3.5 MB）、`finish.json`（8 个序列 `ok:true`）。采集器输出（每序列证据个数与交叉核对值个数）：

```
CN_CPI_INDEX	evidence=3	claims=129	ok
CN_PPI_INDEX	evidence=1	claims=129	ok
CN_PMI_MFG	evidence=1	claims=130	ok
CN_GDP_INDEX	evidence=1	claims=43	ok
CN_M2_YOY	evidence=1	claims=129	ok
CN_EXPORT_YOY	evidence=1	claims=129	ok
CN_CGB_10Y_D	evidence=11	claims=2711	ok
CN_USDCNY_CP_D	evidence=1	claims=203	ok
```

再用服务端的 TS 解析器（`parserFor(series).parse`）解析 dry-run 块里的证据字节，按期合并（NBS CPI 三个分期叶子、中债 11 段）后的逐序列点数与最新期：

```
series_id | host | evidence | points | first | last | last value_text
CN_CPI_INDEX | data.stats.gov.cn | 3 | 129 | 2016-01-31 | 2026-09-30 | 100.9 | 
CN_PPI_INDEX | data.stats.gov.cn | 1 | 129 | 2016-01-31 | 2026-09-30 | 105 | 
CN_PMI_MFG | data.stats.gov.cn | 1 | 130 | 2016-01-31 | 2026-10-31 | 49.3 | 
CN_GDP_INDEX | data.stats.gov.cn | 1 | 43 | 2016-03-31 | 2026-09-30 | 104.5 | 
CN_M2_YOY | data.stats.gov.cn | 1 | 129 | 2016-01-31 | 2026-09-30 | 7.2 | 
CN_EXPORT_YOY | data.stats.gov.cn | 1 | 129 | 2016-01-31 | 2026-09-30 | 36.3 | 
CN_CGB_10Y_D | yield.chinabond.com.cn | 11 | 2711 | 2016-01-04 | 2026-11-06 | 1.5868 | 
CN_USDCNY_CP_D | www.safe.gov.cn | 1 | 203 | 2026-01-05 | 2026-11-06 | 671.68 | 
```

- 所有证据主机都在目录白名单内（`data.stats.gov.cn`、`yield.chinabond.com.cn`、`www.safe.gov.cn`）；无 POST。
- 每个 CN A 序列都有交叉核对值；点数与 claims 个数一致（SAFE 203 点 / 203 claims）。
- `CN_USDCNY_CP_D` 历史从 2026-01-05 开始（已知限制，见运行手册 §10）。
- 运行手册 §10 的核实表已按 `fixtures/cn/manifest.json` + `verification.json` 填写（8 / 8 通过）。

## 3. 未做 / 交给指挥官

- 浏览器步骤（Task 18 Step 8）、概览延迟 p95（Step 7.3）与离线演练：本会话未做，见下方清单。
- 路由 `?preview=1` 的 HTTP 层 curl 未跑（需要本地 dev server 与 Supabase 环境）；同一代码路径（fetch + parse）已由第 1 节直接验证，路由的零写入由 `route.test.ts` 断言。

### 指挥官浏览器检查清单（判断层关闭）

1. `/intel/macro`（US、CN）：头部有区域切换与“快照 / 采集”标签；本期变化计数；“目录覆盖 已核实 N / 目录 M”，每个缺失 / 受限项带原因；指标表；来源栏。控制台 `document.body.innerText.match(/象限|得分|margin|recovery|overheat|stagflation|recession|覆盖率/i)` → `null`。
2. 点击数值：抽屉含 发布机构、转发方、取数 URL、主机、取得时间、SHA-256、定位、变换、适配器、工具版本、权利、标注与修订区；缺失证据显示“缺失”。
3. `/intel/macro/US_DFF`：事实、带周期色带与标记的图、“表格视图”（`period_end / value / available_at / version`）、周期表、事件表、每周期资产表。
4. `/intel/macro?tab=correlation`：预设 p1 → 创建分析；结果有 r / R² / n / 样本 / 方法 / 代码、规则句、散点与表格视图、冻结输入回执；打开 run 页面链接。
5. `/today`：宏观一览卡片没有 SSE / HSI / Nasdaq / DXY 行；缺失显示“缺失”。`/intel`：宏观摘要卡。
6. 开关打开：`MACRO_JUDGMENTS_ENABLED=1` 重启，槽位在 F4 未部署（`/api/judgments` 404）时显示“判断层暂不可用”并带重试。
7. 访客模式（无 Supabase）：宏观 API 回 401 / 503，页面显示“读取失败”且没有任何数字；有已跑过 `macro-sync` 的非生产库时再测带真实数值的 1–6 项与 `/api/macro/overview?region=all` 的 p50 / p95（目标 p95 < 300 ms）。
