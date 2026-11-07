# A 股黄金集抄录指引（草稿，计划三 Task 16b；规格三 §5.4）

> 适用：`src/lib/dq/fixtures/gold/cn-annual-v1.json`（`schema: gold/cn-annual/1`）。抄录人 R1、复核人 R2 用代号，二者不得相同（owner 决策 C）。

## 1. 范围
- 发行人：`scripts/dq/select-cn-sample.ts` 生成模板时 `fact_sync_scope(market='CN', priority>0)` 的主 A 股 ticker，升序取前 min(30, N)（决策 E、H）。N=0 时不开始。
- 期间：FY2022、FY2023、FY2024、FY2025 四个年报；每份只抄"主要会计数据和财务指标"表的**本期**列。
- 科目（固定六个）：营业收入 `revenue_operating`、归属于上市公司股东的净利润 `net_income_parent`、总资产 `total_assets`、归属于上市公司股东的净资产 `equity_parent`、经营活动产生的现金流量净额 `operating_cash_flow`、基本每股收益 `eps_basic`。
- 文件必须是 `tickers × 4 × 6` 的**精确乘积**：一个组合一行，不多不少；缺一行即整份文件无效。

## 2. 每行怎么填
| 字段 | 填法 |
|---|---|
| `printed_value` | 表中数字原样去掉千分位逗号，保留印刷的小数位与负号；不换算、不四舍五入。例：`1,505,600,000.00` → `"1505600000.00"`；`(3.21)` 写 `"-3.21"` |
| `printed_decimals` | `printed_value` 小数点后的位数（与印刷一致；`"1505600000.00"` → 2） |
| `printed_unit_multiplier` | 表头单位：元=1、千元=1000、万元=10000、百万元=1000000、亿元=100000000；每股收益一律 1（元/股） |
| `column` | 固定 `"本期"`；不抄"上年同期""调整后""调整前"等列 |
| `source.document` | 公告标题原文（例："贵州茅台 2024 年年度报告"） |
| `source.cninfo_announcement_id` | 巨潮公告 ID |
| `source.announcement_date` | 公告日期 `YYYY-MM-DD` |
| `source.pdf_url` | 巨潮 PDF 下载地址 |
| `source.pdf_sha256` | 下载得到的 PDF 字节的 sha256（`shasum -a 256 <file>`，必须小写十六进制；大写会被 `gold-pdf.ts` 当作未填）；上传后由 `gold-pdf.ts` 再核一次 |
| `source.page` | 该表所在的 PDF 页码（阅读器显示的物理页，从 1 起） |
| `source.table` | 固定 `"主要会计数据和财务指标"` |
| `tushare_source_ref` | 见第 3 节 |
| `report_type` | 原始年报不填（=1）；只有专门为"变更前原数"（type-5）建的行才填 5，并且必须有它自己核实的源文档 |
| `recorded_at` | 抄录时刻，完整 ISO 时间戳，须含秒与时区（`Z` 或 `±hh:mm`），例如 `2026-11-06T10:00:00+08:00` |

## 3. `tushare_source_ref` 的核实（规格 T14，最容易出错的一步）
- 形式 `<ts_code>:<end_date>:<report_type>:<ann_date>`，取自计划二 `filings.source_ref`（例：`600519.SH:20241231:1:20250403`）。
- **R1 与 R2 各自独立核实**它与本行 PDF（`pdf_sha256`）是同一版本：PDF 封面/公告日期与该引用的 `ann_date`（或 `f_ann_date`）一致；PDF 是**原始年报**，不是更正公告、不是次年年报的比较列。
- 不得用 `filings.document_ref` 代替核实：计划二挂接器在存在 type-5 时会把 type-1 指向更正公告，type-4 会指向次年年报；`document_ref` 只用于交叉核对（不一致时对账行记 `document_ref_mismatch=true`，不改绑定）。
- 找不到与 PDF 同版本的引用 → 该行**不提交**，整份文件因此不完整、暂不进入 F3-6；不得挑一个相近的引用凑数。

## 4. 复核
- R2 逐行对照 PDF 页面核对 `printed_value/printed_decimals/printed_unit_multiplier/page` 与第 3 节的引用；有异议的行由 R1 改，R2 再核。`recorded_by`/`reviewed_by` 写代号。
- 校验：`npx tsx -e "import('./src/lib/dq/reconcile/gold-cn.ts').then(m=>{const r=m.validateGoldCn(require('./src/lib/dq/fixtures/gold/cn-annual-v1.json'));console.log(r.ok?'ok':r.errors.join('\\n'))})"` 必须打印 `ok`。
- PDF 上传：`node --env-file=.env.local --import tsx scripts/dq/gold-pdf.ts --gold src/lib/dq/fixtures/gold/cn-annual-v1.json --pdf-dir <下载目录> --upload`，退出码 0 才算完成。

## 5. 对账怎么用这些行（供理解，不需要操作）
- 右侧值 = `printed_value × printed_unit_multiplier`，区间半径 = `0.5 × 10^(−printed_decimals) × multiplier`；Tushare 原文值落在区间内即通过。
- 只有"以元、两位小数"印刷（multiplier=1 且 decimals=2）的不一致才自动隔离 Tushare 值；千元/万元等舍入印刷的不一致只建人工复核项（`reconcile_review`），由人判断是舍入差还是数据差。
- 一行抄错 → 对账失败 → 隔离或复核 → 改 json 并经复核 → 重跑通过（`inputs_hash` 随文件 sha256 改变）→ 管理员恢复。

## 6. 进入 CI 与 cron 的条件（T15）与当前状态
- 当前（2026-11-06）：`TUSHARE_TOKEN` 已可用，真实 Tushare 夹具（600519.SH / 000333.SZ / 600036.SH / 000858.SZ）与计划二 §15 核对记录已随 PR #104 合入（`docs/audits/2026-11-04-data-foundation-2/17-tushare-verification.md`）。降级**仍然成立**，唯一原因是 owner 决策 C（抄录人 R1 与复核人 R2）未指定；巨潮 PDF 与 `disclosure_date` 挂接随抄录一并完成。
- `gold-cn.integration.test.ts` 只有在真实录制并留存的 Tushare 三表、巨潮挂接与 `disclosure_date` 响应都存在且核对通过后才创建；CN 对账 cron 同时以 `FACTS_CN_ENABLED=1` 与黄金核实完成为门。在此之前 E5 记"未达成（CN 降级）"，不报数字。
