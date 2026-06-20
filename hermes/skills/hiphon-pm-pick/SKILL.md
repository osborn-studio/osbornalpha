---
name: hiphon-pm-pick
description: John Cameron 的主动选股+择时引擎（Hermes 入口）。"今天买什么/选股/买入建议/current picks" → 宏观总闸 + 卡脖子四层漏斗 + 信号面 → 排序买入清单（每只带评级/仓位%/进场区间/止损/风险）。
---

# Hiphon PM Pick（Hermes 薄壳）

权威定义（read_file 后照章执行）：
`/Volumes/AIMATE_WORK/Developer/ClaudeCode/01_active/stock-monitor/skills/hiphon-pm-pick/SKILL.md`

依赖（同读）：doctrine.md（§1 总闸/§2 漏斗/§3 评级/§11 卡脖子作业法）、data-access.md（sm_unlock/sm_get）、storage.md（journal schema）。

Hermes 端注意：
- 取数走 bash + 生产 API（env `STOCK_MONITOR_SITE_PASSWORD`）。
- 每个评级 append `~/.hiphon-pm/calls.jsonl`（含 chain_role/evidence）。
- 消息端输出：先发宏观总闸 + Top 3 摘要，再分条发每只标的明细；合规尾注必带。
