# 数据底座三 · 实施前实测核对记录

每节记录：核对日期、命令、原始文件 sha256、观察值、与代码假设是否一致、处置。原始文件不入库（GLEIF/HKEX 原文件在 `fill-identifiers --apply` 时入桶 `reconcile-raw`）。

## Task 3a · HKEX 证券名单与 GLEIF 表头（规格 §4.1.1、§4.1.4、§14-3）

核对日期 2026-11-05（服务器时间 2026-11-06 UTC）。命令：`curl -sSL -A "OsbornAlpha research osbornhello@gmail.com"` 下载到 `.claude/scratch/verify/`，再 `npx tsx scripts/entity-keys/probe-hkex.ts <file> <file-id>`。

| 项 | 观察值 | 与代码一致 | 处置 |
|---|---|---|---|
| ListOfSecurities.xlsx sha256 / 下载日 | `9f1b9dc5d2869ee6afd9d6d8772878678843d8a8afee0146590b920269dbfe79`（1,341,530 字节，页眉 "Updated as at 06/11/2026"） | — | — |
| 表头行号与列（probe `headerRow`、`columns`） | 表头在第 3 行（`Stock Code, Name of Securities, Category, Sub-Category, Board Lot, ISIN, …` 共 18 列）；`stockCode=0 name=1 category=2 isin=5`；17,080 行 | 列均找到。**偏差 1**：工作表声明的 `<dimension>` 是 `A1:R8`（实际 `A1:R17083`），SheetJS 默认读取只得 5 行 | `parseHkexList` 以 `nodim:true` 读取，补回归用例（改写 dimension 的夹具）；不加则只读到 1 行 |
| ISIN 列存在、`withIsin` / `rows` | 有 ISIN 列；13,809 / 17,080（债券等无 ISIN 的行为空） | — | 港股 ISIN 可由第一份文件直接取得 |
| `Category` 取值（含 `Equity` 的确切写法） | `Equity`（2,809）、`Real Estate Investment Trusts`、`Debt Securities`、`Equity Warrants (Main Board)`、`Equity Warrants (GEM)`、`Exchange Traded Products`、`Derivative Warrants`、`Callable Bull/Bear Contracts` | `link-ah` 按小写 `equity` 比较：一致（REIT/权证类不被误含） | `HKEX_EQUITY_CATEGORY` 取 `equity`（Task 7a） |
| "ISINs assigned by HKEX" URL、表头、`withIsin` | `https://www.hkex.com.hk/-/media/HKEX-Market/Services/Trading/Securities/Securities-Lists/ISINs-assigned-by-HKEX/isinsehk.xls`（.xls，sha256 `374cb4b5c56e984015616fc8b764d01465c4eace931479e995461b59d480ed96`，1,671,168 字节）；表头第 18 行 `Stocks, ISIN Code, HK Stock Code, Type, …`（第 75 行再出现一次表头）；5,333 行、5,333 带 ISIN | **偏差 2**：列名是 `HK Stock Code` / `Stocks`，不是 `Stock Code` / `Name of Securities`；文件是 `.xls` | `parseHkexList` 接受 `hk stock code` 与 `stocks`，跳过重复表头行，补用例；`HKEX_LIST_FILES` 的 `file` 名改为 `isinsehk.xls`，`url` 写回 |
| "Other Numbering Agencies" URL、表头、`withIsin` | `…/ISINs-assigned-by-Other-Numbering-Agencies/isino.xls`（sha256 `facffd9cbc16ee79d86e1ad39b484d1df3d16e7f951d3b276e3847ace9676382`，1,839,616 字节，"Update Date: 02 November 2026"）；表头第 19 行同上加 `Place of Incorporation/Depot:`、`*National Numbering Agency`；11,916 行、8,607 带有效 ISIN；3,309 行 ISIN 被拒（"Not Available" 或权证的非校验位 ISIN，如 `NLBNPHK1FT88`） | 同偏差 2 | 同上；被拒 ISIN 视为无 ISIN（可接受：这些是权证/待上市证券，不进研究股票池） |
| 三文件合并（`mergeHkexIsins`） | 00700 → `KYG875721634`、02318 → `CNE1000003X6`、00005 → `GB0005405286`、00939 → `CNE1000002H1`、00941 → `HK0941009539`，均来自第一份；跨文件 ISIN 冲突 0 条 | — | — |
| GLEIF zip 内文件名、首行、sha256 | 下载 `https://mapping.gleif.org/api/v2/isin-lei/latest/download`（200，`x-gleif-publish-date: 2026-11-05T08:15:08Z`，33,089,731 字节，sha256 `5d79561beef1633a2b88ed2cb4994d550d0189995f237fb09dccdd158652ba1a`）；zip 内唯一文件 `lei-isin-20261105T081508.csv`（320,581,079 字节，9,428,856 行）；首行 `LEI,ISIN`（无 BOM，LF 行尾）；Apple LEI `HWUPKR0MPOU8FGXBT394` 有 949 行（含 `US0378331005`） | 一致 | — |
| 被拒 / 跳过行（质量复审后规则） | `ListOfSecurities.xlsx`：0 拒绝、0 跳过。`isinsehk.xls`：0 拒绝、2 跳过（`non_data`）。`isino.xls`：0 拒绝、37 跳过（`non_data`：`National Numbering Agencies` 图例表的缩写-全称条目与 `Note:` 说明）。原先的 3,309 行 `invalid_isin` 全是占位值 `Not Available`（`NLBNPHK1FT88` 等权证 ISIN 校验位正确，不被拒）；占位值（`Not Available`、`N/A`、`-`、空）= 无 ISIN，不计拒绝。`isino.xls` 11,916 行中 8,607 行带 ISIN | 规则：非数字股票代码且无 ISIN 形态的值 → `skipped(non_data)`；非数字代码但带 ISIN 形态的值 → `invalid_stock_code` | `parseHkexList` 增 `skipped`；占位集 `PLACEHOLDER_ISIN` |
| `-OLD` 并行交易柜台 | 合并后 16 个名称以 `-OLD` 结尾的柜台（如 02934 `CHINA SANDI-OLD`、02936 `SG GROUP H-OLD`、02942 `STAR GROUP-OLD`）被剔除，原因 `superseded_counter`；跨文件 ISIN 冲突仍为 0 | — | `mergeHkexIsins` 返回 `dropped` |
| 原始文件内容类型 | `ListOfSecurities.xlsx` = zip（`PK`，OOXML）；`isinsehk.xls`、`isino.xls` = OLE（`d0cf11e0`） | 复审发现：原先三份都会按 OOXML MIME/`.xlsx` 入桶 | `HKEX_LIST_FILES[].contentType`（xlsx / `application/vnd.ms-excel`）；`RawContentType` 增 `application/vnd.ms-excel`→`xls`；`reconcile-raw` 桶 `allowed_mime_types` 增该项 |

## Task 3b · OpenFIGI 实测（规格 §4.1.2、§14-2；无 key；日期 2026-11-06）

命令：`npx tsx scripts/entity-keys/probe-openfigi.ts docs/audits/2026-11-05-data-foundation-3/raw`（`POST https://api.openfigi.com/v3/mapping`，无 `X-OPENFIGI-APIKEY`；2 个请求，各 3 个 job，均 200）。

| 证券 | 期望（代码假设） | 实测 exchCode / ticker / securityType / marketSector / compositeFIGI | 分组结果（`grouped`） | 一致 |
|---|---|---|---|---|
| AAPL `US0378331005` | US 场所码 ∈ EXCH_MAP，Common Stock，composite `BBG000B9XRY4`，恰 1 组 | 303 条记录；分组后的场所码 `UA,UN,UP,US,UW`，ticker `AAPL`，Common Stock，Equity，composite `BBG000B9XRY4`（其余为海外场所码，被 `exch_unknown` 跳过） | `US AAPL` 恰 1 组 `BBG000B9XRY4`（composite；exch `UA,UN,UP,US,UW`） | 是 |
| 贵州茅台 `CNE0000018R8` | `CG`/`CH`，ticker `600519`，类型 ∈ ALLOWED，恰 1 组 `600519.SH` | 3 条记录；`CH` + `CG`，ticker `600519`，Common Stock，Equity，composite `BBG000BC4595` | `CN 600519.SH` 恰 1 组 `BBG000BC4595`（exch `CG,CH`） | 是 |
| 腾讯 `KYG875721634` | `HK`，ticker `700`，Common Stock，恰 1 组 `00700.HK` | 168 条记录；`HK` ticker `700`（composite `BBG000BJ35F4`）；另有 `HK` ticker `80700`（人民币柜台，composite `BBG01GXJQJR6`）与 `US` ticker `TCTZF`（OTC，composite `BBG000QMWZW4`），均 Common Stock/Equity | 3 个 ticker 各 1 组：`HK 00700.HK`、`HK 80700.HK`、`US TCTZF` | 部分：`00700.HK` 恰 1 组；同 ISIN 还映射出 `80700.HK` 与 `TCTZF` 两个 ticker |
| TICKER `AAPL/US`、`600519/CG`、`700/HK` | 各恰 1 组，与 ISIN 结果同 FIGI | 一次响应 3 个 job：`US AAPL` composite `BBG000B9XRY4`；`CG 600519` composite `BBG000BC4595`；`HK 700` composite `BBG000BJ35F4` | 各恰 1 组，composite FIGI 与 ISIN 结果相同 | 是 |

全部 `securityType` = `Common Stock`、`marketSector` = `Equity`（含 600519 与 0700，不需要扩 `ALLOWED_SECURITY_TYPES`）；分组输出中观察到的场所码（`UA,UN,UP,US,UW,CG,CH,HK`）已在 `EXCH_MAP`，无需改映射。`EXCH_MAP_VERSION` 保持 `exch-map/1`。

决策（计划规则 1 与 4）：三家都"目标 ticker 恰 1 组且 FIGI 正确" → `EXCH_MAP_VERIFIED=true`。腾讯 ISIN 还映射出两个附带 ticker（`80700.HK` 人民币柜台、`TCTZF` OTC），不改适配器（不发明场所偏好）；后续任务（4a `plan.ts`、7a `link-ah`）必须按"待挂接证券的 ticker"取对应候选，而不是把 ISIN 的全部 ticker 当作该发行人的证券，也不得因 ISIN 级结果出现多个 ticker 就认定冲突。夹具 `recorded-probe-isin.json` 的断言相应写为 `['00700.HK:1','80700.HK:1','TCTZF:1']`。

原始响应（入库于 `docs/audits/2026-11-05-data-foundation-3/raw/`，`.meta.json` 为内容寻址侧车）：
- `openfigi-isin-5afdb0e5…139a.json`（ISIN 响应，123,091 字节，sha256 `5afdb0e5d0f9ae85a2b4cb13848b5df2bdd7bb119b2ac1d7c932fc8a1993139a`；对应请求 `openfigi-isin-c581a143…80d7.json`）
- `openfigi-ticker-079188bb…e5b9.json`（TICKER 响应，818 字节，sha256 `079188bbcb12b2230a75a72a9b83cab1a6c5911e80298aba820a16d0516ee5b9`；对应请求 `openfigi-ticker-418b033a…f00b.json`）

## Task 6a · SEC submissions 分页结构（规格 §4.3.3、§14-9；日期 2026-11-06）

命令：`npx tsx scripts/entity-keys/probe-submissions.ts 320193 .claude/scratch/verify/aapl-submissions`（AAPL；UA 用落地 `DEFAULT_USER_AGENT`；2 个请求，均 200，相隔 ≥ 120 ms）。

| 项 | 观察值 | 与 `parseSubmissions`/`parseSubmissionsPage` 一致 | 处置 |
|---|---|---|---|
| `filings.files[]` 元素键 | `name`、`filingCount`、`filingFrom`、`filingTo`；AAPL 1 个分页（1,271 条，1994-01-26 至 2015-10-03） | 一致 | 无 |
| 分页文件名格式 | `CIK0000320193-submissions-001.json` | 匹配 `PAGE_NAME` | 无 |
| 分页文件顶层形状 | 顶层即列式数组，键与 `recent` 完全相同（`accessionNumber`、`filingDate`、`reportDate`、`acceptanceDateTime`、`act`、`form`、`fileNumber`、`filmNumber`、`items`、`core_type`、`size`、`isXBRL`、`isInlineXBRL`、`isXBRLNumeric`、`primaryDocument`、`primaryDocDescription`） | 一致（与 `zz-page-001.json` 假设同形） | 无 |
| `byPage` 条数与日期跨度、`complete` | `recent` 1,004 条（2015-10-05 至 2026-11-05）；分页 1,271 条（1994-01-26 至 2015-10-02）；`complete=true` | — | 注意：`recent` 不是固定 40 条，AAPL 为 1,004 条；`filingTo`（2015-10-03）≥ 分页内最晚申报日（2015-10-02），`coverFrom` 过滤按 `filingTo` 正确 |
| main / 分页 sha256 | main `c323cc184a7963177a2f25621719b861e73ea4562cb637f009e9d4b37548167f`（164,219 字节）；page-001 `c01f4199ed2a19c8ccb302597f996ac4050c13f315258301d1164b924458c502`（206,002 字节） | — | — |
| 原始元数据 | 侧车 `.meta.json` 只含 `cik/name/http_status/kind/sha256/bytes/content_type`，不含 User-Agent | — | UA 含邮箱，故不入元数据 |

结论：分页形状与假设一致，无需改解析器或夹具。无规格 §15 偏差。

## Task 7a · HKEX 名称写法抽查（规格 §4.2.2 规则 2；日期 2026-11-06）

输入：`.claude/scratch/verify/ListOfSecurities.xlsx`（sha256 `9f1b9dc5d2869ee6afd9d6d8772878678843d8a8afee0146590b920269dbfe79`，17,080 行），经 `parseHkexList` 读取；A 侧名称取 `names.test.ts` 的 A 侧写法，比较 `normalizeCompanyName` 结果。

| 代码 | HKEX `Name of Securities` | Category | H 侧归一 | A 侧写法归一 | 相等 |
|---|---|---|---|---|---|
| 02338 | `WEICHAI POWER` | Equity | `weichaipower` | `weichaipower` | 是 |
| 01211 | `BYD COMPANY` | Equity | `byd` | `byd` | 是 |
| 02318 | `PING AN` | Equity | `pingan` | `pinganinsurancegroupcompanyofchina` | 否 |
| 03968 | `CM BANK` | Equity | `cmbank` | `chinamerchantsbank` | 否 |
| 00386 | `SINOPEC CORP` | Equity | `sinopec` | `chinapetroleumchemical` | 否 |

结论：HKEX 名单用的是简称（`PING AN`、`CM BANK`、`SINOPEC CORP`），不是测试里假设的 "… CO LTD - H" 全称；5 家中 2 家归一后相等，3 家不等。按计划，不改测试也不扩词表（测试验证的是归一规则本身）；规则 2 的实际命中率会低（只有 HKEX 简称恰好等于发行人名称的公司），不匹配时"不产生声明"，是精度优先的预期结果。规则 1（同 LEI + HKEX ISIN 硬标识符）才是主要的自动挂接路径。

## F3-5 iXBRL 夹具（Task 15b，2026-11-06）

| accn | 主文档 URL | source_sha256 | trimmed_sha256 | 事实数 | submissions category | isInlineXBRL |
|---|---|---|---|---|---|---|
| 0000320193-23-000106 | https://www.sec.gov/Archives/edgar/data/320193/000032019323000106/aapl-20230930.htm | 0f18e0ee9f9e7ebf89e8d4edae8fbebe33c8c9fb4ac43a9b9e5c777e02991bc6 | df0a11f52de48306524b2ebc7cc9ac6aad296164f1bb51be54541f8f70cfffcc | 115 | Large accelerated filer | true |
| 0000950170-23-035122 | https://www.sec.gov/Archives/edgar/data/789019/000095017023035122/msft-20230630.htm | df4c8e4eab796f8c6bb3b986f841abf7d598e68feabde71f6834c431c61362b4 | 66703f6d2da3ed835737cb8eef537d078c91fd6c68e2f6ee6990d47b4048e64e | 112 | Large accelerated filer | true |

- 裁剪规则 `ixbrl-trim/1`，解析器 `ixbrl/1`；重录命令见 `scripts/dq/record-ixbrl-fixture.ts` 头注释。原始文档与 submissions 经 `--raw-dir` 留在本机 `.claude/scratch/raw-15b/`（未提交）。
- 样本 `us-ixbrl-sample-v1.json`（`fixture/1`，sinceYear 2016）：键数 AAPL 72 / MSFT 67（全部 origin=both）；离线一致性例外 0。
- 夹具使用真实 CIK 与 accession（计划未要求改键）。
- 未纳入：30 家生产样本 v2（需网络与 owner 决策 E；`--live`），E4 以 v2 计量。
- `ixt-sec:*` 格式出现次数：AAPL 1 / MSFT 0（规格 §14 开放问题 6 的首个数据点）。

## F3-6 A 股黄金集（Task 16，降级，2026-11-06）

- 状态：**E5 未达成（CN 降级）**，不报任何通过率数字（规格 T15）。
- 情形变化（相对计划文本）：`TUSHARE_TOKEN` 现已可用（存于仓库外 `~/.config/osbornalpha/secrets.env`，未打印、未落盘），且 PR #104 已把真实录制的 Tushare 夹具（600519.SH、000333.SZ、600036.SH、000858.SZ）与计划二 §15 核对记录合入本分支（`docs/audits/2026-11-04-data-foundation-2/17-tushare-verification.md`）。"无 token / 无真实录制"不再是降级原因。
- 降级仍然成立：唯一未决的 owner 决策是决策 C；另有两项工程待办不依赖 R1/R2——`disclosure_date` 真实响应的录制与留存（2000 积分权限待用真实响应核实，归 Task 18b），以及巨潮挂接。决策 C（抄录人 R1、复核人 R2 与交付日期）未给出；与抄录同时才能完成的巨潮 PDF（`pdf_sha256`、`cninfo_announcement_id`）和 `disclosure_date` 挂接核实也因此未做。故无 `src/lib/dq/fixtures/gold/cn-annual-v1.json`，不放占位或代理值。
- 已交付：校验器 `src/lib/dq/reconcile/gold-cn.ts`（Task 16a：精确乘积、`tushare_source_ref` 核对、印刷精度区间、复核/隔离边界）、对账对 `cn.tushare_vs_cninfo_pdf_gold`（读不到黄金文件时以 `invalid_gold_file` 拒绝启动）、`scripts/dq/select-cn-sample.ts`（模板）、`scripts/dq/gold-pdf.ts --upload`、抄录指引 `docs/runbooks/cn-gold-transcription.md`。
- 有意未做：`gold-cn.integration.test.ts` 未创建、未登记 `criticalSuites`；`vercel.json` 无 CN 对账 cron（`pair=cn.` 计数 0）；路由对 `cn.*` 在 `FACTS_CN_ENABLED!=='1'` 时 403。
- 脚本冒烟（无 `.env.local`，不连库）：`select-cn-sample.ts --count 0` 与无参 `gold-pdf.ts` 均打印用法、退出码 2；`gold-pdf.ts` 对合成 PDF + 三行（一行匹配、一行缺失、一行 `<pending>`）的黄金文件输出 `found` 与 `missing_locally`，汇总 `distinct_pdfs=2, pending_rows=1, failed=1`，退出码 1。`select-cn-sample.ts` 的真实库运行（需 `fact_sync_scope` 的 CN 行）与 `gold-pdf.ts --upload`（需 `reconcile-raw` 桶）是 owner 动作，未在本环境执行。
- 解除降级的 owner 步骤：(1) 指定 R1/R2（决策 C）；(2) 运行 `select-cn-sample.ts` 得到模板，按抄录指引抄录、复核、下载并上传 PDF；(3) 抄录完成后，据已有 Tushare 夹具与新录的 `disclosure_date` 响应另开任务创建并登记 `gold-cn.integration.test.ts`（N 家夹具 → CN 同步 → 本对账对 → 每黄金行恰一结果、`passed/expected >= 95%`、非 passed 全部在 `exceptions.json`），通过后再加 CN cron 并设 `FACTS_CN_ENABLED=1`。

## SEC 假日与 Rule 0-3（Task 17a，2026-11-06 核对）

- 规则：17 CFR 240.0-3(a)——最后一日为周六、周日或假日时，可在其后第一个营业日申报（https://www.law.cornell.edu/cfr/text/17/240.0-3 ，实施时抓取 200，原文含 "may be filed on the first business day following"）。
- 联邦假日（5 U.S.C. 6103，按 OPM 公布的观察日）：https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/ ，2026-11-06 抓取 200，页面只列当前及后续年份：2026 与 2027 两张表逐日与 `SEC_HOLIDAYS` 一致（2026：01-01、01-19、02-16、05-25、06-19、07-03、09-07、10-12、11-11、11-26、12-25；2027：01-01、01-18、02-15、05-31、06-18、07-05、09-06、10-11、11-11、11-25、12-24）。OPM 2028 表首行 "Friday, December 31 * New Year's Day" 即 2027-12-31（2028 元旦周六的观察日），与 `SEC_HOLIDAYS[2027]` 第 12 项一致。
- 2021–2025（审查 D4 把表扩到 2021）：OPM 页面不含这些年份，**未能联网复核**，取自规划时核对与实施者对 5 U.S.C. 6103 观察日规则的推算：2021 为 12 项（含首次的 Juneteenth 观察日 06-18，及 2022 元旦周六的观察日 2021-12-31）、2022 为 10 项（元旦已观察在 2021-12-31；Juneteenth 周日→06-20；圣诞周日→12-26）、2023 为 11 项（元旦周日→01-02；老兵节周六→11-10）、2024 与 2025 各 11 项。
- EDGAR 额外关闭日（SEC 公告：到期申报顺延至下一个运营营业日）：2026-11-06 用默认 SEC User-Agent（`DEFAULT_USER_AGENT`，`src/lib/research/ingest/collectors/shared.ts`）各抓取一次，均 HTTP 200。`edgar-closed-24-25-december-2024`：EDGAR 于 2024-12-24 与 12-25 关闭，"Filings required to be made on Tuesday, December 24 and Wednesday, December 25 will be considered timely if filed on December 26, 2024"，与 `SEC_CLOSURES[2024]` 一致。`edgar-will-be-closed-december-24-2025-through-december-26-2025`：2025-12-24 与 12-26（及 12-25）关闭，12-29 恢复，与 `SEC_CLOSURES[2025]` 一致。2025-01-09（卡特总统国丧日）无单独链接，**未复核**（取自规划时核对）。此前同日首次抓取（描述性 User-Agent、无邮箱）两页均 403，已被本次结果取代。
- 维护：`src/lib/dq/calendar.ts::SEC_HOLIDAYS/SEC_CLOSURES` 每年 12 月补次年；临时关闭按 SEC 公告补入 `SEC_CLOSURES`；表外年份的期限行为 `no_rule`（`none.holiday_table_missing/1`），不猜；`rollForward` 在 15 天内找不到营业日则抛错。

## CN disclosure_date 真实响应核对 (2026-11-06)

目的：规格 §6.1 T15 要求 `CN_DISCLOSURE_VERIFIED` 翻 `true` 之前用真实响应核对 `disclosure_date` 的语义。owner 提供了 `TUSHARE_TOKEN`（`~/.config/osbornalpha/secrets.env`，不入库、不打印、不进夹具），本次取代计划的"无 token 降级"步骤。

**请求与夹具。** 经已落地的 `tushareCallRaw('disclosure_date', {ts_code}, DISCLOSURE_FIELDS)`（`DISCLOSURE_FIELDS='ts_code,ann_date,end_date,pre_date,actual_date,modify_date'`）各取一次，字节原样存为 `src/lib/dq/fixtures/tushare/disclosure_date.<ts_code>.json`，旁带 `.meta.json`（api、params、fields、sha256、fetched_at、http_status、code、msg、request_id；无 token，已对夹具全文检索 token 值：0 处命中）。

| ts_code | 行数 | sha256 | fetched_at |
|---|---|---|---|
| 600519.SH | 101（2001-06-30 … 2026-09-30，每个季末一行，无重复 end_date） | `a873400c9d8cd5a762dfbb87923987c0a57d12cc03e89e3bef48f06859fbc825` | 2026-11-07T01:24Z |
| 000333.SZ | 53（2013-09-30 … 2026-09-30） | `f69c95b7db4dd242c1af2c3b7b08c99293aa3e9157ebba342893739fe0872a51` | 2026-11-07T01:24Z |

**权限/积分。** 两次均 HTTP 200、`code=0`、`msg=""`；没有积分或权限错误。返回字段与 `DISCLOSURE_FIELDS` 完全一致、顺序一致。单个 ts_code 一次返回全部历史（`has_more=false`），日期均为 `YYYYMMDD` 字符串，缺失为 JSON `null`。

**字段语义（实测）。**

- `end_date`：报告期末，恒为 0331/0630/0930/1231。与 `CnScheduleRow.end_date` 一致。
- `actual_date`：**该期定期报告的实际披露日**。与计划二夹具 `src/lib/facts/fixtures/tushare/<ts_code>.*.income.rt1.p1.json` 的 `ann_date`（利润表原始披露公告日）逐期比对：夹具覆盖的 44 期里 600519.SH 44/44、000333.SZ 44/44 相等（其余期间早于夹具 `start_date=20160101`，无法比对），同样 44/44 也等于 `f_ann_date`；零不一致。该比对固化为单测 `src/lib/dq/disclosure-fixtures.test.ts`。
- `pre_date`：交易所预约披露日。两只样本里 `pre_date` 与 `actual_date` 在每一行都相同（提前或推迟披露的情形在样本外出现，见下）。
- `ann_date`：**不是**报告披露日，而是预约披露记录的公告日（不晚于 `actual_date`；很多行等于 `end_date`，如 000333.SZ 26/53 行；也有早到数周的，如 600519.SH 20251231 期 `ann_date=20251225`）。`computeExpectations` 只用它给同一 `end_date` 的多行排序，不用作披露日。
- `modify_date`：预约披露日被修改时的记录日期，绝大多数行为 `null`（两只样本各 2 行非空）；非空时该日期可晚于 `actual_date`（000333.SZ 2013 年报：`pre/actual=20140329`、`modify=20140403`），所以它是修订记录的时间戳，不是披露日。`computeExpectations` 只据其非空打 `detail.schedule_modified`，与实测一致。
- 全市场补充探测（`end_date` 参数、不带 `ts_code`，不存夹具）核对 `actual_date` 在未披露时的取值：`end_date=20260930` 返回 5587 行，其中 `actual_date=null` 6 行（均有 `pre_date`，如 `pre_date=20261029`）、`actual_date≠pre_date` 16 行（提前/推迟披露，如 `pre=20261023 actual=20261017`）、`modify_date` 非空 13 行；`end_date=20260630` 5561 行，null 11、不等 5、modify 19；没有任何 `actual_date` 晚于核对日 2026-11-06 的行；`end_date=20261231`（尚未到期的期间）0 行。结论：已披露 → `actual_date` 为实际披露日；已预约未披露 → `actual_date=null` 且 `pre_date` 为预约日，正是 `computeExpectations` 的用法（`actual_date` 非空 → `filed_not_ingested`，否则 `expected_date=pre_date`）。

**结论。** 语义与计划一致：`actual_date` = 定期报告实际披露日，`end_date` = 报告期末，`modify_date` = 预约日修订记录，`ann_date` = 预约记录公告日。`parseDisclosureDate` 解析两份夹具全部行。据此 `CN_DISCLOSURE_VERIFIED` 翻 `true`（独立提交）。

**日历如何使用该响应（审查后收紧，Task 18b 复审）。** code=0 不等于可用的预约表：`calendar-sync.ts` 把缺 `end_date/pre_date/actual_date` 列、`data:null`（`fields=[]`）判为 `bad_shape`，`has_more=true` 判为 `has_more`（offset 分页在并列行上不稳定，见计划二 17 号核对，不拼页），两者都得 `upstream_lookup='unavailable'` → `unknown_upstream`，原始字节仍入桶，原因进 `skipped_summary(schedule_unavailable)`。响应可用时按**期间**判定：只有响应里存在该 `end_date` 的行，才可由上游把该期判为 `pending`/`overdue`/`filed_not_ingested`；没有该期的行 → 该期保持 `unknown_upstream`（`detail.upstream_incomplete`、`detail.schedule_row_missing`），不因"上游没有这行"而判逾期；已入库的已发布 filing 仍使该期为 `received`。这样 Tushare 对尚无预约记录的期间不返回行（`end_date=20261231` 为 0 行）不会产生假逾期。

**时间戳说明。** 夹具 meta 的 `fetched_at` 是脚本取响应时 `new Date().toISOString()` 的 UTC 值：2026-11-07T01:24Z；本机当时 `date -u` 为 2026-11-07 01:31（PST 为 2026-11-06 17:31），所以正确，对应上文标题里的本地日期 2026-11-06。

**保留事项。** 只核对了两只 A 股的整历史与两个报告期的全市场形状；北交所（`.BJ`）未单独抽查。
