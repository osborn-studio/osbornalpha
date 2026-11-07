# 宏观工作台 P3+P4 实施记录

分支 `claude/macro-p3-p4-6b9829`（合并了 P1+P2 分支 `claude/macro-workbench-bbde80`，fcff800）。每个任务：Sonnet 5.5 实施 → Codex gpt-6-astra 单轮（复审 + 对抗挑战，`task-N-codex.md`）→ 批量修复。

| Task | 提交 | Codex 结论 | 修复轮次 | 备注 |
|---|---|---|---|---|
| 1 迁移、锁、类型、集成套件 | df583dd → fac5d0d | fix required（4×P2、1×P3：完成记录可被覆盖、cutoff 不取自清单、NULL 代际绕过、CHECK 的 NULL 漏洞、终态行登记） | 1 | 修后 24/24；test:migrations PASS |
| 2 契约、开关、端口、夹具 | 76ee1cc | pass with P3 notes（夹具默认计数、端口及时性日期校验） | 0 | 日期校验并入 Task 3；默认计数保留（测试显式给出计数） |
