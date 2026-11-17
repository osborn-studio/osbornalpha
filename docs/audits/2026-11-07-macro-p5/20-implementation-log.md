# 宏观 P5 实施记录

分支 `claude/macro-p5-chaosai-essence`（WP-B）。每个任务：Codex gpt-6-sol 实施（`task-<n>-prompt.md` → `task-<n>-codex.md`）→ mmx 审计（`task-<n>-mmx.md`）→ Opus 复审 → 修复 → 提交。

## 规格审计轮次

| 轮 | Codex gpt-6-astra | mmx MiniMax-M3 | 结果 |
|---|---|---|---|
| 1（第 1 稿） | 02（27 项，8 P1） | 03（48 项，28 P1） | not ready → 第 2 稿 |
| 2（第 2 稿） | 05（16 项，8 P1） | 06（45 项，22 P1） | not ready → 第 3 稿 |
| 3（第 3 稿） | 08（10 项，4 P1） | 09（61 项，39 P1） | not ready → 第 4 稿（完整文本） |
| 4（第 4 稿） | 11（6 项，2 P1） | 12（26 项，19 P1） | not ready → 第 5 稿 |
| 5（第 5 稿） | 15（2 新 P1 + N1/N2 仍开） | 16（19 项，11 P1） | not ready → 第 6 稿 |
| 6（第 6 稿） | 18（1 P1 + 1 P2） | 19（44 项，9 P1） | not ready → 第 7 稿 |
| 7（第 7 稿） | 24（1 P1：N11） | — | not ready → 第 8 稿 |
| 8（第 8 稿） | 28：**ready for an implementation plan**（无新 P1） | — | **规格定稿（第 8 稿，提交 `docs(macro): P5 spec draft 8`）** |

mmx 的逐轮处置记录在规格 §0.1–§0.7；第 6 轮起 mmx 的新 P1 多为早轮项目的改写或与代码事实相悖（例如 `macro_retrievals` 无 adapter 列、`EVENTS_VERSION` 已存在），均已逐条写明"接受 / 说明 / 不接受 + 理由"。定稿依据：Codex gpt-6-astra 第 8 轮无 P1，mmx 全部 P1 已有处置。

| Task | 提交 | mmx 结论 | 修复轮次 | 备注 |
|---|---|---|---|---|
