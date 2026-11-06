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
| AAPL `US0378331005` | US 场所码 ∈ EXCH_MAP，Common Stock，composite `BBG000B9XRY4`，恰 1 组 | 303 条记录；`US`/`UN`/`UW` 等，ticker `AAPL`，Common Stock，Equity，composite `BBG000B9XRY4`（其余为海外场所码，被 `exch_unknown` 跳过） | `US AAPL` 恰 1 组 `BBG000B9XRY4`（composite；exch `UN,US,UW`） | 是 |
| 贵州茅台 `CNE0000018R8` | `CG`/`CH`，ticker `600519`，类型 ∈ ALLOWED，恰 1 组 `600519.SH` | 3 条记录；`CH` + `CG`，ticker `600519`，Common Stock，Equity，composite `BBG000BC4595` | `CN 600519.SH` 恰 1 组 `BBG000BC4595`（exch `CG,CH`） | 是 |
| 腾讯 `KYG875721634` | `HK`，ticker `700`，Common Stock，恰 1 组 `00700.HK` | 168 条记录；`HK` ticker `700`（composite `BBG000BJ35F4`）；另有 `HK` ticker `80700`（人民币柜台，composite `BBG01GXJQJR6`）与 `US` ticker `TCTZF`（OTC，composite `BBG000QMWZW4`），均 Common Stock/Equity | 3 个 ticker 各 1 组：`HK 00700.HK`、`HK 80700.HK`、`US TCTZF` | 部分：`00700.HK` 恰 1 组；同 ISIN 还映射出 `80700.HK` 与 `TCTZF` 两个 ticker |
| TICKER `AAPL/US`、`600519/CG`、`700/HK` | 各恰 1 组，与 ISIN 结果同 FIGI | 一次响应 3 个 job：`US AAPL` composite `BBG000B9XRY4`；`CG 600519` composite `BBG000BC4595`；`HK 700` composite `BBG000BJ35F4` | 各恰 1 组，composite FIGI 与 ISIN 结果相同 | 是 |

全部 `securityType` = `Common Stock`、`marketSector` = `Equity`（含 600519 与 0700，不需要扩 `ALLOWED_SECURITY_TYPES`）；所有 A/H 场所码（`US,UN,UW,CG,CH,HK`）已在 `EXCH_MAP`，无需改映射。`EXCH_MAP_VERSION` 保持 `exch-map/1`。

决策（计划规则 1 与 4）：三家都"目标 ticker 恰 1 组且 FIGI 正确" → `EXCH_MAP_VERIFIED=true`。腾讯 ISIN 还映射出两个附带 ticker（`80700.HK` 人民币柜台、`TCTZF` OTC），不改适配器（不发明场所偏好）；后续任务（4a `plan.ts`、7a `link-ah`）必须按"待挂接证券的 ticker"取对应候选，而不是把 ISIN 的全部 ticker 当作该发行人的证券，也不得因 ISIN 级结果出现多个 ticker 就认定冲突。夹具 `recorded-probe-isin.json` 的断言相应写为 `['00700.HK:1','80700.HK:1','TCTZF:1']`。

原始响应（入库于 `docs/audits/2026-11-05-data-foundation-3/raw/`，`.meta.json` 为内容寻址侧车）：
- `openfigi-isin-5afdb0e5…139a.json`（ISIN 响应，123,091 字节，sha256 `5afdb0e5d0f9ae85a2b4cb13848b5df2bdd7bb119b2ac1d7c932fc8a1993139a`；对应请求 `openfigi-isin-c581a143…80d7.json`）
- `openfigi-ticker-079188bb…e5b9.json`（TICKER 响应，818 字节，sha256 `079188bbcb12b2230a75a72a9b83cab1a6c5911e80298aba820a16d0516ee5b9`；对应请求 `openfigi-ticker-418b033a…f00b.json`）
