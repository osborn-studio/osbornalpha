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
