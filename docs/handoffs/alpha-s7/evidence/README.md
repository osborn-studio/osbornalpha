# 本轮运行证据

2026-09-22，Node v22.22.1，本地隔离 PostgreSQL 17，30 迁移。日志仅整理行尾空白和终端 CR，不改命令结果。上一轮全量 153 文件 / 1,210 测试通过；typecheck、lint、Next build 均退出 0。数据库测试未跳过，使用本轮新建集群，结束后已停止。

- `tests.log`：`S4_TEST_STATE=<本轮隔离状态文件> npm test -- --reporter=dot`，退出 0。
- `typecheck.log` / `lint.log` / `build.log`：对应 npm run 命令，退出 0。
- `handoff.json`：`npx tsx scripts/s7/verify-handoff.ts`，40 件文件及旧 golden/Replay 通过，退出 0。
- `clean-consumer.json`：`npx tsx scripts/s6/verify-engine.ts`，固定 tarball 干净离线安装验证，退出 0。
- `market-complete.json`：完整合成样例，退出 0，但 accepted_for_evaluation=false。
- `market-incomplete.json`：缺日合成样例，按预期退出 2。
- [审计及处置](AUDIT-DISPOSITION.md)：Claude CLI 实际 Opus 5.5；仅审核所给文件，未运行测试。修复后的最终代码由本地回归验证。
- `validation.json`：本轮最终源码哈希与范围。历史浏览器记录仍按其原始覆盖范围解释，本轮无 UI 改动，无新浏览器验收声明。

真实行情验收 not_passed，Jev not_run，生产部署 not_run；没有使用生产数据库或修改他人正在实现的实时接口。

## 双包联调续做

新增 `tests-pair.log`：154 文件 / 1,220 测试通过，使用新建的 30 迁移隔离数据库，集群结束后停止。`lint-pair.log`、`build-pair.log`、`typecheck-pair.log` 为最新检查，均退出 0；类型检查首次与 Next build 并行触碰 `.next/types` 出现临时 TS6053，构建结束后顺序重跑退出 0，保留最终成功日志。`market-pair-tests.log` 为定向用例；`handoff-pair.json` 记录 48 件固定文件、旧 golden/Replay 与双包合成样例通过。`market-pair.json` 是 XNYS 标的 + ARCX/SPY 基准样例输出，仍为 accepted_for_evaluation=false。`opus55-pair.*` 是本轮只读外审，复审结果及处置见 [双包审计处置](PAIR-AUDIT-DISPOSITION.md)。

## 清单重新固定（2026-09-25）

`codex/s5-s6-alpha-integration` 合并进 `main`（#43，#44 叠加）后，`main` 此前的 Next.js 安全补丁与 npm 10 锁文件对齐改变了 `package.json`（1820 → 1850 字节）与 `package-lock.json`（223997 → 222960 字节），`scripts/s7/verify-handoff.ts` 因此失败。本次只刷新这两条清单项的大小与 SHA-256；其余 46 项、S4 冻结哈希（`contract-hashes.json`）与固定 vendor tarball 均未变。`handoff-repin-20260925.json` 为重新固定后的校验回执：48 件通过，合成 golden/Replay 匹配。真实行情验收仍为 not_passed，Jev 与生产部署仍为 not_run；本次不改变任何业务代码、引擎或政策版本。
