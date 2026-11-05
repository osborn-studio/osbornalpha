# 16 — 计划二实施记录

执行：Opus 5.5 指挥；每任务 Sonnet 5.5 实施子代理 → Opus 规格复审 → Opus 质量复审 → Codex CLI gpt-6-astra（medium）`codex review` + 对抗挑战 → 修复 P1/P2。
计划：`docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md`；交接：`docs/superpowers/plans/2026-11-04-HANDOFF-data-foundation-2-execution.md`。

| 序 | 任务 | 提交 | 规格复审 | 质量复审 | Codex review / 挑战 | 修复轮次 | 备注 |
|---|---|---|---|---|---|---|---|
| 1 | Task 1 迁移 + 锁 + Row 类型 + 集成测试 | 3442de9, da73028, 5d7c818 | ✅ 与计划逐字一致 | Approved（3 项 minor 已并入） | review: 无缺陷；挑战: 3×P2 → #2 接受（DB 层拒绝值不同的裁决 + 非 facts 项）；#1 移交 Task 16（公共指标须 based_on_rev = fact_state_rev）；#3 驳回（规格 §7.3：`[]` 仅确认知晓）；修复复审无缺陷 | 2 | 17/17 真实 PG；test:migrations 通过 |
| 2 | Task 2 types + FactsDb（Supabase/内存）+ 契约用例 | 2fcbdc0, 675cb51, 9022ee5 | ✅（5 处内存与 SQL 细差已修） | 第一轮 Needs fixes（stageFilings 部分写入、factsByIds 顺序）→ Approved | review: P2 内存读序≠SQL；挑战: 2×P2（指标分页跨快照、内存实现无串行化）+P3 → 全部接受并修；修复复审: P2 stageFilings 部分写入 → 修；终审无缺陷 | 2 | 24/24 单测 |
| 3 | Task 3 pgFactsDb + 真实库契约与并发测试 | 0de1341, 7d45b71, a53c5cb | ✅（补 §11.2 两项并发用例：quarantine×publish、租约交接时写入在途） | Approved（时间戳三实现统一 ISO；阻塞判定改为 pg_blocking_pids 轮询；statement_timeout） | review/挑战: 无缺陷；两轮修复复审无缺陷 | 2 | 38/38 真实 PG；46 单测；R7-1 物化半与物化交错 stale 移交 Task 11 |
| 4 | Task 4 概念目录、单位、期间分类、无损数值 | f0ef183, 9bf41bd, 94dbe3c, e6f64d4, 8fc9c61 | ✅（计划"33 概念"注记已过时） | Needs fixes → 修后通过（二次方正则、`__proto__`、畸形输入快速失败） | review: P2 币种白名单不全；挑战: P2 `money_cap`(货币资金)≠现金及等价物 → **新增 `monetary_funds` 概念，CN `cash` 留缺（规格偏差，§16 记录）**、P2 `__num` 可伪造、P3 控制字段先转 Number；后续复审: P2 `__num` 拒绝过宽、P2 长度上限破坏幂等 → 全修；终审无缺陷 | 4 | 26+ 单测；币种表对照 Intl 并含 2008 后退役码 |
| 5 | Task 5 keys + planFactWrites | d710444, 168233e, 8bc4182 | ❌→✅（同日冲突 payload.key 缺 available_date，SQL 守卫永不命中 → 修） | Needs fixes → 修后通过（O(n²) 同日查找、当前值取自被替代行、确定性） | review/挑战: P2 映射升级把同一 filing 旧代当成同日冲突 → 修；修复复审无缺陷 | 2 | 16/16 单测 |
| 7 | Task 7 read.ts sequencesOf（read_facts 纯参考实现） | b5c5686, 88ad109 | ✅（缺发行人/市场范围 → 修） | 修后通过（多键/单位/A→B→A/日期校验用例） | review: P2 等时刻不同写法时未交 fact_id 决胜；挑战: P2 跨发行人合并序列 → 全修；复审无缺陷 | 1 | 13/13 单测；毫秒级 ISO 归一不复现亚毫秒顺序（已记录限制） |
| 6 | Task 6 rules + 警告汇总 + INFO_CODES | 5ccba96, 6f10287, c584aaf | ✅（计划 Number() 运算改为精确十进制，公式/容差/边界一致） | 两遍复审通过（测试 1.006e30 写错已修；边界用例） | 挑战: 3×P2（CN 毛利率口径应配 revenue_operating、跳变先验依赖到达顺序、证据转 Number 丢精度）+ review P2（恒等式取被替代代的输入）→ 全修；复审 P2 批量先验未先解析当前披露 → 修 | 3 | 67 单测（含 dq） |
| 14 | Task 14 scope.ts | 03678e9, dd3b08c, 57d9935 | ✅ | 修后通过（内存实现退役不生效 → 新增 FactsDb.scopeAll；CN 票据选择：主 A 股 → 唯一 A 股，排除 B 股，歧义跳过 — 指挥决策） | 挑战: P2 单页读取推断完整性 → 全量分页；P2 并发对账陈旧快照 → 移交 Task 17；复审 P2 分页排序非唯一 → keyset 去重 | 2 | 209 单测；test:db 2804 通过 |
| 15 | Task 15 derive.ts + materialize（纯实现与单测） | ad9cfd2, a164ec1, 0bd1557, 4e7e07e | ✅（a/b 规则未入 lineage → 加 ytd_rule/quarter） | Needs fixes → 修后通过（同一季度两种差分按到达顺序取值 → 歧义留缺；多 current/跨发行人守卫） | 挑战: 2×P2（母公司/合并口径混用、差分区间未校验 3M）→ 修；复审无缺陷 | 3 | 32 derive 单测；ROE 平均权益 ≤0 留缺 |
| 8 | Task 8 快照存储 + 同步核心 | 9db4de4, a7a72d6, 821fb2b | ✅（小项：parse_error 字段名、哈希核验、租约续期、截止后真实错误） | Needs fixes → Approved（清理不抛出且只释放一次、DeadlineError 判定、计数守恒 balanced()） | 挑战: **P1 发布不校验规划时的 state_rev → 管理员中途提升可致同日两值同时公开 → `publish_sync_run(p_expected_rev)` + `stale_plan`**；P2 缺日期键跨期碰撞（规格 §7.1 偏差：键含期间与单位）、截止未在阶段间检查、计数早于发布、物化失败仍记 success、dry-run 忽略 truncated；复审 P2 parse_error 消息白名单 → 全修 | 2 | 258 单测 + 39 真实 PG |
| 10 | Task 10 EDGAR companyfacts 适配器 + 录制脚本 + 美股夹具 | 7434571, df546b3（+ sync d9d07fa） | ✅（AAPL/MSFT 真实 SEC 数据抽查一致，源 sha256 已记录） | 两遍通过 | review: 2×P2（并发节流不安全、响应体下载在重试边界外）；挑战: 5×P2（缺日期行先过滤导致低优先级标签替补、奇异期间丢弃冲突值、定位符只到分组级 → **改为行级（含数组下标），规格 §4.7 偏差**、缺日期证据缺值与哈希、节流）→ 全修；复审 P2 同键多行只留首行证据 → sync 按键聚合 rows[] | 2 | 25 适配器单测 |
| 9 | Task 9 处理钩子 resolveFactsItem + 路由接入 | 60ad92a, 4534de8, eb94334 | ✅（缺口：已接受但无钩子的项永久 already_resolved） | 修后通过（内部错误文本不出客户端；no_target 记失败；按错误码映射 HTTP） | 挑战: **P1 提升先于持久化钩子状态 → `resolve_facts_quarantine` 同事务写 `hook:pending` 并返回落库的 chosen_fact_ids**；P2 预检拒绝已删成员、审计用锁前快照；复审 P2 恢复审计行须用持久化的裁决人/状态/所选 → 全修；终审无缺陷 | 3 | 309 单测；39 真实 PG |
| 11 | Task 11 美股离线回放 sync-us.integration.test.ts（critical）+ 黄金文件 | 23688b4, 756710b | ✅（+指挥追加：裁决→物化含被选行；真实 stale_computation 交错） | 修后通过（租约并发用例真正并发；同期多期限过滤） | 挑战: 3×P2（黄金来源字段未校验、CN 条目未回放却计入矩阵、交错用例未改变输入）→ 全修；复审无缺陷 | 1 | 10/10 真实 PG；**偏差：黄金门在 ready:false 时只告警不失败（计划设计为红灯），ready:true 时全量强制** — 待 owner 抄录 |
| 12 | Task 12 tushareCallRaw + Tushare 三表适配器 + 合成夹具（**降级路径：无 TUSHARE_TOKEN**） | cc6fb79, c25801a, 75e0f30 | ✅（合成夹具 `_synthetic/`；核对记录见 [17-tushare-verification.md](17-tushare-verification.md)；update_flag 同日不同值仍隔离 — 指挥决策） | 修后通过（分页卡死判定只哈希 fields+items；预算错误码映射；单次 20 s 预留） | 挑战: 4×P2（行 ts_code 未校验可张冠李戴、短页覆盖 has_more、f_ann_date 非法时回退 ann_date、重录残留旧页）→ 全修；复审 P2 夹具代切换非原子 → 代号文件名 + 清单最后原子替换 | 2 | 342 单测；未创建 sync-cn 集成测试，CN cron 不加入 |
| 16 | Task 16 三个公共读路由 + /api/financials 弃用头 | 97fdd8c, 70debf4, c2ca875, 69eff08, 6e5da1d | ✅（+指挥要求：指标仅在 based_on_rev = fact_state_rev 时提供，否则 stale:true） | Needs fixes → 修后通过（新鲜指标短缓存；CN 票据规范化；畸形 % → 400） | 挑战: 3×P2（factIds 模式伪造 isCurrent、期限过滤晚于键限额、未发布 filing 公开）→ 修；复审 **P1 预先规范化使 BRK.A 解析成 BRK** → 精确优先；**P1 真实解析器回落后市场判为 US** → 以实际匹配的证券行定市场，拒绝 HK；P2 合并发行人重定向 → 读源证券行 | 4 | 112 路由/解析单测（真实 resolveIssuer） |
| 13 | Task 13 巨潮挂接 cninfo-link（**降级：未创建 sync-cn 集成测试**） | 2c2d1d7, c676b85, 92259cc, 1b2e1d1, 34aceed | ✅（**restatement 改为挂接次年同类定期报告 — 规格偏差**） | Needs work → 修后通过（标题整串匹配：年度报告/全文/（A股）/更正多种写法；https、分页上限、体积上限；夹具保留原始字节与 sha256） | 挑战: 2×P2（子串匹配把问询函/审议意见当报告、未传播预算）+ review P2 节流 → 修；三适配器统一共享节流器（按实际起始时刻、预算不足不睡）；复审 P2 排队中不可取消 → 修 | 4 | 26 cninfo 单测；383 facts+sources 单测 |
| 17 | Task 17 cron 路由、生产依赖装配、脚本、vercel.json | 614d1a6, 75bc0bd, 6f06775, 118446f | ✅（仅 US cron；CN 以 `FACTS_CN_ENABLED=1` 门控 — 计划无此门控，新增） | 修后通过（路由兜底 500 只回码；回执只含码与计数；重复 limit 参数） | 挑战: P2 对账退役与并发对账竞态 → **SQL 原子守卫：`reconcile_fact_sync_scope(p_snapshot_at)` + `scope_confirmed_at`**；P2 CN 挂接取票规则与范围不一致 → 复用 `chooseCnTicker`，无法挂接不耗尝试次数；复审 P2 时钟偏差 → 快照回拨 5 分钟、未变更的活跃确认也记时 → 修；终审无缺陷 | 3 | 327 单测；53 真实 PG；test:migrations 通过 |
| 18 | Task 18 运行手册第 8 章 + 规格 §16 + 全量门禁 + 真实 SEC dry-run | （见本提交） | — | — | 全量门禁见下节；`test:db` 每轮仅 1–3 个非 facts 套件偶发失败（DDL 重放锁超时 / 死锁），逐个单独重跑全绿，facts 套件零失败 | 0 | **F2-7：代码与文档齐备；黄金门禁待 owner 录入（2026-11-04，`plan2.json` 为 `ready:false`，3 条全是 `<pending>`）— 黄金门只告警，`test:db` 绿 ≠ 黄金已核实** |

## 全量门禁（Task 18 Step 5，2026-11-04，分支 `claude/data-foundation-2` @ `348f7ee`，工作树仅文档改动）

| 命令 | 结果 |
|---|---|
| `npm test` | 通过：297 files passed、23 skipped；2827 tests passed、232 skipped（vitest 9.3 s） |
| `npm run typecheck` | 通过（退出码 0） |
| `npm run lint` | 通过（`--max-warnings=0`，退出码 0） |
| `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db` | **7 次完整运行：1 次全绿（320 files、3057 passed、2 skipped）；6 次各有 1–3 个非 facts 套件失败**（见下）。每次 `facts.integration.test.ts`（43 tests）与 `sync-us.integration.test.ts`（10 tests）全部通过；无 `Database suite inventory drift` |
| `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:migrations` | 通过：`PASS: fresh schema equals seeded upgrade; existing rows preserved; both local clusters stopped.` |

`test:db` 逐轮：

| 轮 | 结果 | 失败项 |
|---|---|---|
| 1 | 319 files / 3056 passed、1 failed | `s4/ledger.integration`「creates the four append-only tables … replays」：`40P01` 死锁（`AccessExclusiveLock`） |
| 2 | 同上 + 1 个未处理错误 | `dq/dq-foundation.integration`「creates the four tables … replays」：`55P03` lock timeout（`alter table public.dq_quarantine enable row level security`）；另有 `anchor-store.test` 的 `FileHandle` GC 未处理错误 |
| 3 | 同上 | `dq/dq-foundation.integration`（同上） |
| 4 | 同上 + 1 个未处理错误 | `s4/ledger.integration`（同上） |
| 5 | 3 failed / 3054 passed | `dq/dq-foundation.integration`、`observability/owned-process-group.test`、`fanout/run.integration` |
| 6 | **全绿**：320 files、3057 passed、2 skipped | — |
| 7 | 1 failed / 3056 passed | `dq/dq-foundation.integration`（同上） |

单独重跑（`LC_ALL=C PATH=… npx tsx .claude/scratch/db-one.ts <file>`）：`s4/ledger.integration.test.ts` 12/12 通过；`dq/dq-foundation.integration.test.ts` 5/5 通过。对照：排除 `src/lib/facts/*.integration.test.ts` 的整套运行 2 次 → 第 1 次 1 failed（`s4/anchor-two-phase` V10），第 2 次 318 files / 3004 passed 全绿。
判断：失败全部是共享库上"整库 DDL 重放 / 竞争"类用例在整套负载下的锁超时（`dq-foundation` 的 `replayMigration` 是 3 s `lock_timeout` 的有限重试，`dq_quarantine` 又恰好被 facts 的集成套件在整套中并发使用，所以含 facts 套件时更常见），与 facts 代码无关；但**有 facts 套件时 6/7 轮出现该类偶发**，owner 如需稳定的 `test:db` 全绿，应把 `dq-foundation` 的重放放宽重试次数/超时，或让 facts 集成套件不与它并发——本任务不改代码，记为后续。

## SEC 真实网络 dry-run（Task 18 Step 4，2026-11-05 06:12 UTC）

命令：`node --import tsx scripts/facts/sync.ts --market US --no-db --cik 320193 --cik 789019 --cik 1045810`（无环境变量、内存库，不写任何库；退出码 0，耗时 2.9 s）。`codeVersion` = `348f7ee604db857764db259f90c31b29450895e3-dirty`（工作树含未提交文档改动）。`status:"dry_run"`，`batchId:null`，`errors:[]`，`detail:{attempted:3,published:0,failed:0,skipped:0,idle:false}`，总计 `fetched=inserted=8935`，`duplicates/versioned/quarantined/failed=0`。

另用只读脚本（`.claude/scratch/sec-stats.ts`，未提交）对同一份 companyfacts 重新抓取并解析以取得细项；三家 `snapshot sha256` 与 `sync.ts` 输出逐位一致：

| 发行人 | CIK（fetchKey） | outcome | fetched = inserted | filings | 概念数 | skipped | ambiguous / odd / missing_available_date | 快照 sha256 |
|---|---|---|---|---|---|---|---|---|
| AAPL | 0000320193 | planned | 3000 | 44 | 26 | `before_since_year` 2314 | 0 / 0 / 0 | `75a78f918313f3336823517d6c34908d23dd07f07e90e625c61e705e3bb6d27b`（3,858,323 字节） |
| MSFT | 0000789019 | planned | 3033 | 46 | 25 | `before_since_year` 2313 | 0 / 0 / 0 | `8c1903c041f5c27e86ed15f37debb1f41882b7904bba129ef9edc76478b1e8ea`（4,938,072 字节） |
| NVDA | 0001045810 | planned | 2902 | 44 | 26 | `before_since_year` 1943 | 0 / 0 / 0 | `19ef503a5770f5660964b3c3aea6937579d9b359da344afe6a9adf59c63d26ff`（4,092,966 字节） |

抽查值（`duration=12M` 的最新两个财年；来自公开 companyfacts 原值，未与 10-K 原文逐页核对，**不是黄金断言**）：

| 发行人 | revenue（标签） | net_income_parent（`us-gaap:NetIncomeLoss`） |
|---|---|---|
| AAPL | 2026-09-26 = 478834000000 USD；2025-09-27 = 416161000000 USD（`RevenueFromContractWithCustomerExcludingAssessedTax`） | 2026-09-26 = 132175000000；2025-09-27 = 112010000000 |
| MSFT | 2026-06-30 = 331839000000 USD；2025-06-30 = 281724000000 USD（同上标签） | 2026-06-30 = 133749000000（同期有两次披露行，均为同值）；其前一财年见库内回放 |
| NVDA | 2026-01-25 = 215938000000 USD；2025-01-26 = 130497000000 USD（`us-gaap:Revenues`） | 2026-01-25 = 120067000000（同期两次披露行，同值） |

核对点：三家 `outcome='planned'`、`snapshotSha256` 恰一个 64 位 hex、`errors` 为空、`ambiguous/odd/missing` 全 0、`inserted = fetched − quarantined`（`quarantined=0`）。
