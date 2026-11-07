# 03 · Tushare 核对项 1–3 + §17.1 实测记录（2026-11-06）

范围：规格 `docs/superpowers/specs/2026-11-04-industry-research-design.md` §2 Tushare 接口表、§4.4、§6.1–§6.4、§16 核对项 1/2/3、§17.1。
方法：用落地的 `tushareCallRaw`（`src/lib/data/sources/tushare.ts`）真实调用 Tushare，调用间隔 1.3 s，未遇到配额/限流错误（约 70 次调用）。脚本与原始响应缓存在 `.claude/scratch/tushare-verify/`（gitignore，`s1.mts`…`s15.mts`、`cache/`），裁剪后的真实 fixtures 在 `.claude/scratch/tushare-verify/fixtures/`（见文末）。token 未写入任何文件（已对整个目录做 token 字面量扫描：0 命中）。

结论速览

| 项 | 结论 | 置信度 | 对规格的影响 |
|---|---|---|---|
| 核对项 3 | 成分是 **SW2021 代码空间里的回溯重建历史**（最早 1990 年代）；`out_date` 是**最后一个成员日（含）**，不是剔除日；退市**不**关窗；`parent_code` 用 `industry_code` 命名空间 | 高 | `valid_to = out_date + 1 日`；按 `delist_date` 截断；2021-07-30 前全部 `history_class='reconstruction'`；需要代码别名表 |
| 核对项 2 | `daily_basic.total_share` = **全部股份类别（A+H+B）发行总数**；`float_share` = 流通 A 股 | 高 | `total_share_basis='all_classes_incl_h_b'` |
| 核对项 1 | `sw_daily.pe` 是 **TTM**，但用的是申万自己的算法：A 股自由流通市值加权调和平均、TTM 按申万日历、亏损股市值留在分子 | PE 中高；PB 未定 | `comparator_basis='ttm'`，但 §6.3 的 `Σ总市值/ΣTTM` 公式与官方值差约 +17%（银行）、−3.9%～+3.2%（食饮），**必须改公式**，否则对照全部 `outside`；`pb` 对照未确认 |
| §17.1 | 退市公司 `stock_basic` 和 `income` 都能取到；`stock_basic` 默认只返回 `L` | 高 | 退市装载必须显式传 `list_status='D'` |

---

## 1. 核对项 3：`index_classify` / `index_member_all`

### 1.1 `index_classify(src='SW2021')`

| level | 行数 | has_more | is_pub=0（未发布指数） | 字段（实际返回） |
|---|---|---|---|---|
| L1 | **31** | false | 0 | `index_code, industry_name, parent_code, level, industry_code, is_pub, src` |
| L2 | **134** | false | 10 | 同上 |
| L3 | **346** | false | 87 | 同上 |
| （对照 SW2014）| L1 28 / L2 104 / L3 227 | | | |

- 数量与文档的 31/134/346 一致。所有 `index_code` 都以 `.SI` 结尾；`src` 都是 `SW2021`。
- **`parent_code` 用的是 `industry_code` 命名空间**：L2 有 134/134 个 `parent_code` 能在 L1 的 `industry_code` 里找到，在 `index_code` 里找到 0 个；L3 是 346/346 对 0。L1 的 `parent_code='0'`。例：`801016.SI 种植业 parent_code=110000`，它的 L1 是 `801010.SI 农林牧渔 industry_code=110000`。
- `is_pub='0'` 表示申万不发布该指数的行情，`sw_daily` 预计取不到；估值只看 L1 时不受影响。

### 1.2 `index_member_all`（两个 L1 + 全市场）

| 请求 | 行数 | 分页 | 说明 |
|---|---|---|---|
| `l1_code=801120.SI, is_new=Y` | 129 | 1 页，`has_more=false` | `out_date` 全为 null |
| `l1_code=801120.SI, is_new=N` | 58 | 1 页 | `out_date` 全部非 null |
| `l1_code=801780.SI, is_new=Y` | 42 | 1 页 | |
| `l1_code=801780.SI, is_new=N` | **0** | 1 页 | 银行没有任何迁出记录 |
| `801120.SI Y`，`limit=50` 翻页 | 50/50/29 | `has_more` true/true/false | 共 129 行，无重复，与单次请求一致：`limit/offset` 有效 |
| 不加过滤（默认 Y） | **5922** | 单次，`has_more=false` | 超过文档写的单次 2000 行上限；正好 = `stock_basic` L 5579 + D 343（缺 2 只 2006 年前退市的） |
| `is_new=N` 不加过滤 | 2006 | 单次，`has_more=false` | |

结论与证据：

1. **两遍并集能覆盖进出，但前提是按全市场取（或按 31 个 L1 都取）**。单个 L1 内会有缺口，因为迁到其他 L1 的那段在别的 L1 里。全市场 Y+N：0 重叠，1895 次衔接（≤7 天），111 处间隔 >7 天。这些间隔大多是 2011-09-30→2011-10-10 一类的长假（按交易日看是连续的），少数是真正的未分类期（例：`000506.SZ` 2018-06-15→2022-07-29，`000007.SZ` 2009-05-27→2013-07-01）。跨 L1 的例子：`300892.SZ` 食饮 2020-09-07–2021-07-29 → 商贸零售 2021-07-30–2022-07-28 → 食饮 2022-07-29–至今。
2. **`out_date` 是最后一个成员日（含），不是剔除日**。下一段的 `in_date` 等于 `out_date` 后一天（或下一个交易日）：2021 版切换时 564 行 N 的 `out_date=20210729`，519 行 Y 的 `in_date=20210730`。因此窗口是 `[in_date, out_date]` 闭区间，相当于 `[in_date, out_date+1 日)`。§4.4 的 `valid_to=out_date` 半开窗口会让每次迁移少算一天，应改为 `valid_to = out_date + 1 日`。
3. **退市不会关窗**。全市场 Y 中有 341 只 `list_status='D'`，全部 `out_date=null`、`is_new='Y'`。例：`002770.SZ 科迪退` 于 2022-06-23 退市，仍是 `Y 20150119–null`。因此必须用 `stock_basic.delist_date` 截断。另有 **6 只退市股的 `in_date` 晚于退市日**（例：`000662.SZ in=20210730 delist=20210412`，`600669.SH in=20060901 delist=20040915`）。这说明分类是事后补上的，应隔离（建议新增原因 `membership_after_delist`）。
4. **2021-07-30 前的 `in_date` 是旧版申万分类历史，已映射到 SW2021 代码上（回溯重建）**：
   - 历史行（最早 1991-04-03，`000001.SZ`）全部使用 SW2021 的 L3 代码，例如 `600866.SH 星湖科技 N 食品饮料/851242.SI 19940818–20210729`。全市场成员行共用到 338 个 L3 代码，337 个在 SW2021 L3 表中，没有一个是 SW2014 代码。
   - 有"同一 2021 代码前后两段"的伪迁移：`000869.SZ 张裕A 851233 20001010–20070629` → `851233 20070702–null`，`600059.SH` 同理。这对应旧版分类的调整日，在 2021 代码空间里看不出变化。
   - 首个 `in_date` 不等于上市日：188 只里只有 47 只相等，其余多数早于上市日几周到几个月（例：`600519.SH` 2001-07-31 对比上市 2001-08-27，`002304.SZ` 2009-01-22 对比 2009-11-06）。这更像发行/核准时点，不是上市日。最多的单一 `in_date` 是 `20210730`（食饮 Y 33 行，全市场 519 行）。
5. **一只股票迁移后会出现多行**：食饮 146 只里有 41 只多行，Y 行（当前）与 N 行（历史）互补。
6. **版本可以确定是 SW2021**：成员的 L1 代码包含只在 2021 版存在的代码（如 `801980.SI 美容护理`），L3 代码均属于 SW2021 空间。**例外**：成员中的 `850412.SI 特钢Ⅲ`（钢铁，`600399.SH` 等）在 `index_classify` 中是 `850401.SI 特钢Ⅲ`。两个接口有 1 处代码不一致，需要别名表或按 `(l2_code, l3_name)` 对齐，否则这些成员无法解析。

**对规格**：
- 历史起点：SW2021 的原生口径从 **2021-07-30** 开始，更早的行一律 `history_class='reconstruction'`（回溯映射，无公告日）。2021-07-30 之后的行也只有生效日、没有公告日，`availability='effective_date_assumed'` 维持不变（§17.9）。
- 适配器：只按 31 个 L1 循环可以，但"两遍并集"必须是 31×2 遍的全集，衔接检查要跨 L1 做。`has_more` 翻页可用；单次实际可返回 >2000 行，但仍应翻页。
- 解析：`parent_code` 用 `industry_code` 与上级连接，成员与分类用 `index_code` 连接（成员接口不返回 `industry_code`），需要 `850412.SI↔850401.SI` 别名。
- 新增规则：`valid_to=out_date+1`；按 `delist_date` 截断（`valid_to = min(out_date+1, delist_date)`）；`in_date > delist_date` 时隔离。

## 2. 核对项 2：`daily_basic.total_share` 口径（trade_date=2026-10-30）

单位：Tushare 万股；公告为股。

| ts_code | 类型 | `total_share`（万股） | `float_share`（万股） | 公告/月报股本 | 来源 |
|---|---|---|---|---|---|
| 600036.SH 招商银行 | A+H | 2,521,984.5601 | 2,062,894.4429 | 总 25,219,845,601 = A 20,628,944,429 + H 4,590,901,172（2026-02 股份变动月报） | [itiger 月报摘要](https://www.itiger.com/news/1194369097)；券商研报 [AP202604291821757483](https://pdf.dfcfw.com/pdf/H3_AP202604291821757483_1.pdf) |
| 601318.SH 中国平安 | A+H | 1,810,764.1995 | 1,066,006.5083 | 总 18,107,641,995 = A 10,660,065,083 + H 7,447,576,912（2026-01 月报，2026-09 月报总额相同） | [itiger 2026-01 月报](https://www.itiger.com/hans/news/1179434921)；[H2_AN202609301830049741](https://pdf.dfcfw.com/pdf/H2_AN202609301830049741_1.pdf) |
| 601398.SH 工商银行 | A+H | 35,640,625.7089 | 26,961,221.2539 | 356,406,257,089 = A 269,612,212,539 + H 86,794,044,550（长期不变的公开股本，未取当期公告） | — |
| 000869.SZ 张裕A | A+B | 64,328.0128 | 45,505.5620 | 2026-09 注销回购 1,396 万股（占注销前 2.124%）后约 6.43 亿股；A 约 4.55 亿股 | [10jqka 2026-10-08](https://stock.10jqka.com.cn/20261008/c680490734.shtml)；[cfi 行情页](https://quote.cfi.cn/quote_000869.html) |
| 601166.SH 兴业银行 | 仅 A | 2,116,286.4665 | 2,116,286.4665 | 2026-06-30 为 21,162,859,513（可转债持续转股，Tushare 数值多 5,152 股，方向一致） | [H2_AN202607011826631420](https://pdf.dfcfw.com/pdf/H2_AN202607011826631420_1.pdf) |

另外，`total_mv = close × total_share` 精确成立（例：600036 43.55 × 2,521,984.5601 = 109,832,427.59 万元）。

**结论**：`total_share` 是**所有股份类别（A+H+B）的发行总股本**。`float_share` 是流通 A 股，不含限售 A 股，也不含 H/B。招行、平安两家的 A+H 拆分与月报逐股一致，工行一致，张裕 B 股口径一致。置信度：高。
**对规格**：`METHOD_CONFIG.total_share_basis = 'all_classes_incl_h_b'`。§6.1 的 `mcap = close × total_share` 是按 A 股价格计价的全公司市值（与 Wind/Tushare `total_mv` 同口径），**不是** A 股市值。申万的 `sw_daily.total_mv` 不是这个口径：银行 Σ Tushare `total_mv` / `sw total_mv` = 1.4446，食饮 1.0165，差额与 H/B 股市值量级一致，申万更像只算 A 股。`daily_basic` 不提供"A 股总股本（含限售）"字段。

## 3. 核对项 1：`sw_daily` 的 pe/pb 口径

### 3.1 官方文档

- 申万宏源研究下载中心有《申万行业市盈率、行业市净率算法说明》，2012-11-22 发布：`https://www.swsresearch.com/swindex/pdf/swclassifypepb.pdf`（sha256 `35dedd2c586a02a3f9b42cec6c877b9363a595fd6c1e882f508c677b2a9b01de`，4 页）。条目列表来自 `https://www.swsresearch.com/institute-sw/api/download_center/instruction_explain/?page=2`。文档要点：
  - 行业 PE/PB 按 **A 股自由流通市值加权**：`PE = Σ FFS_i / Σ (E_i × FFS_i / TS_i)`。FFS 是 A 股自由流通市值，TS 是总市值。PB 同式，用最新净资产。
  - "静态"PE 的口径：5–8 月用上年年报，**9 月至次年 4 月用中报 ×2**，不是 LYR。"滚动"PE 的 TTM 按日历选季度：9–10 月 = T-1 年 Q3+Q4 + T 年 Q1+Q2，11–12 月才换成含 T 年 Q3 的四个季度。
  - 样本剔除亏损股（归母净利润为负）、净资产为负的股票和暂停上市股；剔除后 ≤5 只不计算；新股上市第 6 个交易日纳入。
- 《申银万国股价系列指数编制说明 5.0》（2025-10-30，`https://www.swsresearch.com/swindex/pdf/80100350.pdf`，sha256 `f3ed31c6…61eea`）只写指数按自由流通市值加权计算，没有行业 PE/PB 发布口径。
- 文档没写 `sw_daily.pe` 对应静态还是滚动，所以下面做数值检验。

### 3.2 数值检验（成员 = `index_member_all` 在 D 日有效的成员；行情 = 全市场 `daily_basic(D)`；自由流通股本用 Tushare `free_share` 代替申万的口径）

| 变体（PE） | 801780 银行，5 天偏差 | 801120 食饮，5 天偏差 |
|---|---|---|
| §6.3 现行：Σ总市值 / Σ TTM（Tushare `pe_ttm` 反推） | **+16.9% ～ +18.0%** | −3.9% ～ +3.2%（随亏损处理与 TTM 截取方式变化，5 天内不稳定） |
| 自由流通加权，Tushare `pe`（LYR） | +1.2% ～ +1.5% | −6.4% ～ −6.5% |
| 自由流通加权，申万"静态"（2026H1 归母 ×2，`income_vip`） | −8.3% ～ −8.5% | −18.5% |
| 自由流通加权，申万日历 TTM（FY2025 − H1 2025 + H1 2026），亏损股分子分母都剔除 | +0.25% ～ +0.50% | −4.5% ～ −4.7% |
| 自由流通加权，申万日历 TTM，亏损股**市值留在分子**、利润不计入分母 | **+0.25% ～ +0.50%** | **+0.05% ～ +0.34%** |
| 同上算法但改用总市值加权（含亏损） | +17% | +4.6% ～ +5.0% |

逐日数据（申万日历 TTM，亏损股市值留在分子）：

| 日期 | 食饮 sw pe | 自算 | 偏差 | 银行 sw pe | 自算 | 偏差 |
|---|---|---|---|---|---|---|
| 2026-10-26 | 21.28 | 21.343 | +0.30% | 6.51 | 6.542 | +0.49% |
| 2026-10-27 | 21.17 | 21.241 | +0.34% | 6.59 | 6.623 | +0.50% |
| 2026-10-28 | 20.86 | 20.928 | +0.33% | 6.55 | 6.583 | +0.50% |
| 2026-10-29 | 21.11 | 21.179 | +0.33% | 6.68 | 6.712 | +0.48% |
| 2026-10-30 | 21.71 | 21.722 | +0.05% | 6.72 | 6.737 | +0.25% |

食饮 127 只有行情的成员中，35 只申万日历 TTM ≤ 0（银行 0 只），因此亏损处理方式在食饮上能明显区分各变体，在银行上不能。

PB（2026-10-30，自由流通加权，净资产来自 `balancesheet_vip`）：

| 净资产取法 | 银行（sw 0.55） | 食饮（sw 3.41） |
|---|---|---|
| H1 归母 | 0.550（0.0%） | 3.561（+4.4%） |
| Q3 优先、否则 H1，归母 | 0.540（−1.9%） | 3.455（+1.3%） |
| H1 含少数股东 | 0.544（−1.2%） | 3.446（+1.1%） |
| Tushare `pb` 反推 | 0.631（+14.8%） | 3.521（+3.3%） |

`sw_daily` 的 `float_mv` 与 Σ Tushare 自由流通市值不一致（比值 1.09 / 1.22），申万的自由流通口径与 Tushare `free_share` 不同。官方 pe/pb 只保留两位小数，银行 PB 的分辨率约 ±0.9%。

**结论**：
- `comparator_basis = 'ttm'`（置信度中高）。申万日历 TTM 在 10 个格子里全部落在 1% 以内（最大 0.50%）；静态（中报 ×2）和 LYR 都被否定。现在的算法是自由流通加权调和平均，亏损股市值留在分子，与 2012 年文档"剔除亏损股"的文字不完全一致，需要在更多行业、更多季节上复核。局限：只测了 2 个 L1，日期都在 2026-10 最后一周（9–10 月日历段）；11 月换季的切换点和 5–8 月段都没测；FFS 用的是 Tushare 的代理值。
- **PB 口径未确认**：分子分母形式与 PE 相同，银行能对上，食饮在各种净资产口径下偏差 1.1%–4.4%。在核对完成前，`pb` 不能作为对照指标。

**对规格（§6.3/§6.4）**：
- 按 §6.3 现行公式（Σ全公司市值 / Σ TTM 归母，日期取最近 `period_end ≤ D`）算出的值，与官方值在银行差约 +17%，在食饮差 −3.9% 到 +3.2%（随亏损处理变化）。逐日对照会几乎全部 `outside`，序列永远达不到资格。
- 两条路可选，选择权在 owner/规格作者：(a) 新增一个按申万算法计算的对照指标 `pe_ttm_sw`：用 A 股自由流通市值加权、申万季度日历、亏损股市值留在分子。这需要 `security_marks` 增存 `free_share`（或可得的 A 股自由流通股本），只有这个指标与官方值对照；现有的 `pe_ttm`（总市值整体法）作为自有指标单独发布，与官方值的对照状态标 `not_applicable`。(b) 保留 §6.3 公式，`pe_*` 对照一律 `not_applicable`，此时没有官方锚点可以授权发布。
- **I-3 能否进计划**：核对项 1、2 的问题本身已经回答（`ttm` 和 `all_classes_incl_h_b`），但 §6.4 的门控在现行 §6.3 公式下无法通过。建议**先修订规格 §6.3/§6.4（采用 a 或 b），再让 I-3 进计划**。`pb` 维持 `series_qualified=false`，直到 PB 核对完成。

## 4. 其他接口

| 接口 | 结果 |
|---|---|
| `trade_cal` | 字段 `exchange, cal_date, is_open, pretrade_date`（不传 fields 时也是这 4 个）；`is_open` 是数字 0/1；不传 `exchange` 默认 `SSE`；按日期**降序**返回；2026-10 共 31 行，17 个交易日；`pretrade_date` 在休市日也有值（例：2026-11-01 → 20261030）。 |
| `stock_basic` | 请求的 17 个字段都返回；`list_status`：L 5579、D 343、**P 0**；D 行都有 `delist_date`（1999-07-12 到 2026-10-28）。**默认只返回 L**：`ts_code='002770.SZ'` 不带 `list_status` 返回 0 行，带 `D` 返回 1 行。退市股的 `industry`/`area` 多为 null。 |
| `income`（§17.1） | 退市公司可以取到：`002770.SZ`（2022-06-23 退市）57 行，最新 `end_date=20260630`（退市后仍在披露）；`600090.SH`（2022-07-07 退市）100 行，最新 `20210930`。`income_vip` / `balancesheet_vip`（按 period 全市场）对本 token 可用，有 `has_more` 分页（`income_vip` 2026H1 两页 9000+1680）。 |
| `sw_daily` | 字段 `ts_code, trade_date, name, open, low, high, close, change, pct_change, vol, amount, pe, pb, float_mv, total_mv`；按日期降序；`total_mv`/`float_mv` 单位万元。 |

## 5. Fixtures（`.claude/scratch/tushare-verify/fixtures/`）

每个文件都是 `{request:{api_name, params, fields}, response_sha256, request_id, code, msg, data:{fields, items, has_more}}`。`data` 原样保留 API 返回内容，`response_sha256` 是原始响应字节的哈希，请求参数里不含 token。

| 文件 | 行数 |
|---|---|
| `index_classify-SW2021-L1/L2/L3.json` | 31 / 134 / 346（完整） |
| `index_member_all-801120.SI-{Y,N}-p0.json`，`index_member_all-801780.SI-{Y,N}-p0.json` | 129 / 58 / 42 / 0（每组只有 1 页） |
| `index_member_all-801120.SI-Y-limit50-p{0,1,2}.json` | 50 / 50 / 29（分页证据） |
| `stock_basic-<ticker>.json` ×12 | 600519、000858、600887、000869、603288、600036、601398、000001、601166、601318；退市 002770、600090 |
| `daily_basic-20261030-<ticker>.json` ×10 | 前 10 只（逐只请求；用逗号拼多个 ts_code 返回 0 行） |
| `sw_daily-801120.SI-20261026-20261030.json`，`sw_daily-801780.SI-…json` | 5 / 5 |
| `trade_cal-SSE-202610.json` | 31 |
| `income-002770.SZ-delisted.json` | 57 |

全市场原始响应（`daily_basic` 5 天、`index_member_all` 全量、`income_vip`/`balancesheet_vip`、`stock_basic` L/D/P）只放在 `cache/`，用于复算本文数值，不作为 fixtures。
