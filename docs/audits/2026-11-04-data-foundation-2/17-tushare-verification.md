# Tushare `report_type` 1/4/5 核对记录（规格 §6.3 / §15 第 1 条；计划二 Task 12 Step 10-11）

只记事实。Task 18 据此填写 runbook 8.7 核对表；`16-implementation-log.md` 引用本文件。

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
