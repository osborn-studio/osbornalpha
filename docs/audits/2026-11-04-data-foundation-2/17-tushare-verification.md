# Tushare `report_type` 1/4/5 核对记录（规格 §6.3 / §15 第 1 条；计划二 Task 12 Step 10-11）

只记事实。runbook 8.7 核对表是本文件的摘要；`16-implementation-log.md` 引用本文件。

## 2026-11-06 核对（真实 token）

**范围**：本节核对的是 **Tushare 接口响应的行为**（日期列、值、分页、标志位）。它不等于一手文件核实：更正公告日、股本单位等与巨潮原文的对照由黄金集抄录完成（runbook 8.11-6）。分页实验（121 行基线、limit 7/10 逐页对比、1998 期末行）是未归档的探针观察：探针只读、未提交，响应未入库；可用下列请求复现：`income`、`ts_code=600519.SH`、`start_date=20000101`、`report_type=1`，先不带 limit 取全量，再按 `limit=10`/`7` 递增 `offset` 取完，按行多重集比较。已归档、可回放的只有下表的夹具。

环境：`TUSHARE_TOKEN` 取自仓库外 `~/.config/osbornalpha/secrets.env`（`node --env-file=… --import tsx`；token 未打印、未落盘，夹具与 meta 中检索 token 串与 `"token"` 键均为 0 处）。探针脚本只读、未提交。

真实夹具（`record-fixture.ts --tushare <ts_code> --since-year 2016`，2026-11-06 12:52 UTC；每家 3 api × report_type 1/4/5 = 9 页，全部单页、`has_more=false`；单页最大 77 行，远低于 `limit=2000`）：

| ts_code | 角色 | 清单 sha256（前 8 位） | 解析（`sinceYear=2016`）：filings / candidates（rt1 / rt4 / rt5） / ambiguous |
|---|---|---|---|
| 600519.SH 贵州茅台 | 主样本、巨潮挂接 | `2eb7bb6b` | 82 / 1745（1031 / 714 / 0） / 0 |
| 000333.SZ 美的集团 | 深市样本 | `ca2efd5c` | 82 / 1908（1163 / 745 / 0） / 6 |
| 600036.SH 招商银行 | 银行（无营业成本等科目） | `892f477c` | 82 / 1463（889 / 574 / 0） / 12 |
| 000858.SZ 五粮液 | **修订对**（2025 半年报、三季报于 2026-04-30 更正） | `5d2fbd10` | 88 / 1739（1034 / 657 / 48） / 0 |

修订对的寻找：对 600519.SH、000333.SZ、600036.SH、601318.SH、000858.SZ、600900.SH、601398.SH、000002.SZ、600028.SH、601857.SH 查询 `income` `report_type=5`（`start_date=20160101`），只有 000858.SZ 返回行（2 行）。

| 项 | 观察（公司 / 期末 / 原文行） | 结论 |
|---|---|---|
| `limit` / `offset` / `has_more` 的真实分页行为 | 600519.SH `income` rt1 `start_date=20000101`：不带 limit 一次返回 121 行、`has_more=false`；`limit=5,offset=0/5` 各 5 行、`has_more=true`；`offset=10000` 返回 0 行、`has_more=false`。用 `limit=10`（13 页）与 `limit=7`（18 页）逐页取完：行数与一次取完相同（121），`has_more` 在末页前全为 true、末页 false；**但页间排序在并列行（同 `end_date` 的 `update_flag` 0/1 两行）上不稳定，两次 limit=10 各有 2 行缺失、2 行重复，limit=7 缺 1 重 1** | **已观察（未归档探针），带条件通过**：`has_more`/`offset` 语义与适配器假设一致；但多页拼接**不保证完整**（并列行可能丢失/重复）。因此适配器改为**单页强制**：任一 `ts_code × api × report_type` 返回 `has_more=true` 即以 `tushare_unavailable: multi_page_unverified` 失败，不拼接。生产与夹具中每个流均为单页（10 年约 80–130 行 ≪ 2000） |
| `start_date` 过滤哪一列 | `start_date=20000101` 返回了 `end_date=19981231`、`ann_date=20010726` 的行 | 按公告日过滤，不按期末；解析按期末年份另行过滤（`skipped.before_since_year`） |
| type 1 被更正后 `ann_date` / `f_ann_date` 是否变化 | 000858.SZ 期末 2025-06-30：rt1 原行 `ann_date=f_ann_date=20250828`、`total_revenue=52770984383.52`（`update_flag` 0 与 1 各一行，值相同）**保留**；另**新增**一行 `ann_date=20250828`、`f_ann_date=20260430`、`update_flag=1`、`total_revenue=23509972048.65`。期末 2025-09-30 同样（原 `20251031`/60945321083.57 保留；新增 `f_ann_date=20260430`/30637727654.97） | **已核对（Tushare 响应）**：更正后 `ann_date` 不变、`f_ann_date` = 更正公告日、旧行不删。`available_date = f_ann_date ?? ann_date` 正确地把更正行放在更正日；合成夹具假设成立 |
| type 5 的公告日取哪一列 | 000858.SZ rt5：`20250630` 行 `ann_date=f_ann_date=20250828`、值 52770984383.52；`20250930` 行 `20251031`/60945321083.57；`update_flag=0` | **已核对（Tushare 响应）**：type 5 = 原始公告日、原始值；合成夹具假设成立 |
| type 4 | 000858.SZ rt4 `end_date=20250630`：`ann_date=f_ann_date=20260829`（2026 半年报）、值 23509972048.65（= 更正后值） | 上年同期数随次年报告公布，公告日 = 次年报告日；更正后的期间在 rt4 中是更正值 |
| 同一 `end_date` 下 1 与 5 同日并存 | 000858.SZ 2025-06-30：rt1 原行与 rt5 行同为 2025-08-28、同值 | **出现**；两者是不同 filing（`source_ref` 的 report_type 段不同），同键同日**同值** → 不构成同日冲突（§5.3 只对不同值隔离）。同日不同值的并存在 4 家真实数据中未观察到 |
| `update_flag` 语义 | 000858.SZ：更正前的 rt1 旧行与更正后的新行**都是** `update_flag=1`；多处同一 filing 内 0/1 两行同值；000333.SZ 有 6 个、600036.SH 有 12 个同 filing 同键 0/1 两行**不同值**（多为 `total_share`，另 1 个 `fin_exp_int_exp`） | **`update_flag` 不能用来挑"最新"**：政策（同 filing 同键不同值 → `ambiguous_value` 隔离，不按 `update_flag` 自动择一）维持，真实数据验证了它的必要性 |
| `is_calc=1` 行的处理 | 规格：跳过 | `parseTushareStatements` 跳过并计入 `skipped.is_calc` |
| `balancesheet.total_share` 的单位 | 600519.SH 2026-09-30：`1250081601.0` | **数量级相符**：按"股"解读与贵州茅台总股本约 12.5 亿股一致；与年报原文的逐字核对待黄金集抄录 |
| 控制列与数值形态 | 控制列（`report_type`、`comp_type`、`end_type`、`update_flag`）在 items 中是**字符串**（`"1"`）；值列是普通十进制（含 `1250081601.0` 这类带 `.0` 的写法），未见科学计数法 | 解析两种形态都接受；值列无损解码为规范十进制 |
| `balancesheet.money_cap` 口径 | 目录：`monetary_funds`（货币资金，含受限资金），CN 不映射 `cash` | 未与年报原文核对金额（黄金集抄录时核对） |
| `f_ann_date` 无效时的行为 | 适配器策略；4 家真实数据 `missingAvailableDate` = 0 | `f_ann_date` 存在但无效不回退 `ann_date`；仅为空时用 `ann_date` |
| 真实夹具 | **已录制**（上表） | `fixtures/tushare/<ts_code>.manifest.json` + 代号页文件；装载器优先真实夹具；`_synthetic/` 仅供单测 |
| 巨潮夹具 `600519.SH-2024-annual.json` | 2026-11-05 录制；`available_date=2025-04-03` = Tushare rt1 `end_date=20241231` 行的 `f_ann_date` | 与 Tushare 年报 filing 同日，可挂接 |

**结论**：§15 第 1 条四项全部有真实观察；适配器与解析的假设成立（分页完整性限于单页）。据此创建 `sync-cn.integration.test.ts`、CN cron 进入 `vercel.json`、`FACTS_CN_ENABLED` 改为缺省开启（`0` 关闭）。

**后续**：多页拼接在并列行上不稳定，适配器已单页强制（见上）。若将来某个流超过 2000 行，应改为按 `end_date` 分段请求而不是 `offset` 分页。

**挂接影响**：更正后 rt1 保留原行，因此"同 `ts_code:end_date` 存在 rt5"不足以判定某个 rt1 filing 是更正版；`deps.ts` 改为仅当该 rt1 filing 的日期不同于所有 rt5 的原始日期时才按更正标题挂接（原行仍按普通定期报告挂接）。

## 2026-11-04 降级记录（已被上节取代）

日期：2026-11-04。环境：本机无 `TUSHARE_TOKEN`（已检查），未发起任何 Tushare 网络请求。降级路径：交付单测与"未核对"记录，不创建真实夹具，`sync-cn.integration.test.ts` 不创建，CN cron 不加入 `vercel.json`。

| 项 | 观察（公司 / 期末 / 原文行） | 结论 |
|---|---|---|
| `limit=2000` / `offset` / `has_more` 的真实分页行为 | 未核对 | `fetchTushareStatements`：`has_more=true` 一律续页（短页也续），`has_more=false` 即停；`has_more=true` 的空页、或 `fields`+`items` 内容哈希（不含 `request_id`）与上一页相同，以 `tushare_unavailable: paging_not_advancing` 失败；最多 200 页；满页且 `has_more=false` 在解析时计入 `skipped` 原因 `page_full_no_more`。核对前不得宣称覆盖完整 |
| type 1 被更正后 `ann_date` / `f_ann_date` 是否变化 | 未核对 | 合成夹具假设更正后 `f_ann_date` = 更正公告日 |
| type 5 的公告日取哪一列 | 未核对 | 合成夹具假设 = 原始公告日（`f_ann_date ?? ann_date`） |
| 同一 `end_date` 下 1 与 5 同日并存是否出现 | 未核对 | 出现时解析按 §5.3 判 `same_day_conflict`（不同 filing）或 `ambiguous_value`（同 filing） |
| `update_flag` 语义 | 已核对（交接记录，据 Tushare 文档，2026-11-04）：`1` = 最新版本 | 政策（commander 决定）：同日、同键、值不同的行保持 `ambiguous_value` 隔离，待真实数据行为核对后再放宽；解析不按 `update_flag` 自动择一 |
| `is_calc=1` 行的处理 | 规格：跳过 | `parseTushareStatements` 跳过并计入 `skipped.is_calc` |
| `balancesheet.total_share` 的单位 | 已核对（交接记录，据 Tushare 文档，2026-11-04）：单位 = 股 | 解析按"股"存储（`shares`）；尚未与真实响应原文比对 |
| `report_type` 1/4/5 的语义；接口权限 ≥2000 积分；每次调用一个 `ts_code` | 已核对（交接记录，据 Tushare 文档，2026-11-04） | 适配器按此设计（每个 `ts_code` × api × report_type 单独请求）；尚无真实响应夹具 |
| `balancesheet.money_cap` 口径 | 目录：`monetary_funds`（货币资金，含受限资金），CN 不再映射 `cash` | 未与原文核对金额 |
| 响应中数值是否带小数/科学计数法、`report_type` 在 items 中是数字还是字符串 | 未核对 | 解析对两种形态都接受（控制列整数检查在精确十进制上；字符串形整数也接受）；所有值列按 `tushareFieldsFor(api)` 无损解码为十进制字符串 |
| `f_ann_date` 无效时的行为 | 适配器策略 | `f_ann_date` 存在但无效不回退 `ann_date`：该行以 `missing_available_date` 隔离并保留两个原始日期串；仅当 `f_ann_date` 为空/缺失时才用 `ann_date` |
| 真实夹具 | 未录制 | `fixtures/tushare/_synthetic/`（`request_id:"synthetic"`）仅供单测；黄金断言与 `sync-cn.integration.test.ts` 等待真实夹具 |

夹具以 `<ts_code>.manifest.json` 描述（页清单 + sha256 + `has_more`）；加载器只读清单所列页并校验哈希、页连续、末页 `has_more=false`；录制先写临时目录、校验后整体替换该发行人的文件集并删除清单外的旧页。

录制与核对：`node --env-file=<仓库外文件> --import tsx scripts/facts/record-fixture.ts --tushare 600519.SH --since-year 2016`（同样 `000333.SZ`、`600036.SH`；至少一家的 `income.rt5.p1.json` 应有行），再用 `--since-year 2000` 重录 `600519.SH` 观察 `has_more` 翻页。完成后把"未核对/未录制"改为"已核对（日期，夹具 sha256 前 8 位）+ 观察"。
