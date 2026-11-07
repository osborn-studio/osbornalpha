# 宏观工作台 P3+P4 实施记录

分支 `claude/macro-p3-p4-6b9829`（合并了 P1+P2 分支 `claude/macro-workbench-bbde80`，fcff800）。每个任务：Sonnet 5.5 实施 → Codex gpt-6-astra 单轮（复审 + 对抗挑战，`task-N-codex.md`）→ 批量修复。

| Task | 提交 | Codex 结论 | 修复轮次 | 备注 |
|---|---|---|---|---|
| 1 迁移、锁、类型、集成套件 | df583dd → fac5d0d | fix required（4×P2、1×P3：完成记录可被覆盖、cutoff 不取自清单、NULL 代际绕过、CHECK 的 NULL 漏洞、终态行登记） | 1 | 修后 24/24；test:migrations PASS |
| 2 契约、开关、端口、夹具 | 76ee1cc | pass with P3 notes（夹具默认计数、端口及时性日期校验） | 0 | 日期校验并入 Task 3；默认计数保留（测试显式给出计数） |
| 3 StrategyDb、hash | 8270607 → 918973a | fix required（P2 稀疏数组破坏清单身份；P3 内存恢复扫描与生产不一致） | 1 | pg 42/42 |
| 4 numeric、manifest | 2d9dd33 → 918973a | pass with P3 notes（下溢 / 非有限值；失败路径测试） | 1 | 已修 |
| 5 政策事件合并 | 68a2b06 → 918973a | pass with P3 notes（等值衔接事件；精确重放断言） | 1 | 已修；下游过滤 0bp 事件 |
| 6 传导流、剧本、F4 标记 | 39de167 → fe2cc4b | fix required（P2 别名绕过目标状态；P2 结算归属错配） | 1 | |
| 7 政策反应矩阵 | cdeb2fc → 831a63e | fix required（P2 负半 bp 舍入；P2 维度定义未冻结进清单） | 1 | 维度冻结进 params；重录夹具 |
| 8 行动段 × 资产表、重放 | 6ee5d39 → c36ed78 | fix required（P2 列覆盖未冻结；P2 截止日期未按 UTC） | 1 | 新增 utcDate，全模块替换 |
| 9 事实与月度复盘 | 846f25f → aab4374 | fix required（P2 不完整基线误报首发；P2 source_inputs 用观测 id） | 1 | baseline_unavailable 事实 |
| 10 渲染、词法校验、提示 | d59fb60 → 48fa66f | pass with P3 notes（诊断只留首个命中；兼容测试未用生产事实） | 1 | |
| 11 F4 客户端、偏差、解读编排 | 1354b38 → f9a5a5e | fix required（5×P2：登记证据校验、详情形状、空详情 incomplete、模型输入先于计费、恢复时 finally 结算） | 1 | |
| 12 路由、cron、计量依赖 | 72bebb9 → 7fa66d2 | fix required（P2 大写 UUID；P3 集成路径测试） | 1 | 真实处理器 + 生产适配器集成测试 6 例 |
| 13 i18n、视图模型、组件 | 002be0f → 0eb2be6 | fix required（5×P2：歧义失败保留请求 id、加载/读错态、矩阵清单与证据、移动端钻取、解读引用） | 1 | 组件无 DOM 测试设施，逻辑抽到视图模型测试 |
| 14 页面、禁用词扫描、运行手册、对账脚本、门禁 | ab3e879 → 6bb25d2 | fix required（2×P2：对账分页、逐行回执） | 1 | |

## 全量门禁（Task 14，ab3e879）

- `npm test`：413 文件 / 4623 通过、0 失败；1 个未处理错误 `FileHandle closed during garbage collection` 来自 `src/lib/research/s4/anchor-store.test.ts`（与本分支无关，单独跑 8/8 通过；已知本机负载问题）→ 进程退出码 1。
- `npm run typecheck`、`npm run lint`：通过。
- `test:db`：440 文件 / 4956 通过、1 失败（`fanout/run.integration` 死锁，已知本机负载级联项，单独 `db-one.ts` 9/9 通过）；`strategy.integration.test.ts` 42/42。
- `test:migrations`：PASS。
- `npm run build`：通过；四个页面、九个 `/api/macro/strategy/*` 路由与 `/api/cron/macro-review` 为动态；提示文件随服务器构建产物发布（`.next/server/chunks/static/media/macro-explain-v1.{zh,en}.*.md`）。
