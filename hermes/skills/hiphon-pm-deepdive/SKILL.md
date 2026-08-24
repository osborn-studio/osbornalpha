---
name: hiphon-pm-deepdive
description: John Cameron 个股深度研究（Hermes 入口）。"深度分析X/该不该买X/投资报告" → 商业模式/护城河/财务/产业链位置/估值/催化剂/风险 全套报告 + 操作建议（评级/仓位/止损）。
---

# Hiphon PM Deepdive（Hermes 薄壳）

权威定义：`/Volumes/AIMATE_WORK/Developer/ClaudeCode/01_active/stock-monitor/skills/hiphon-pm-deepdive/SKILL.md`（read_file 后照章执行）。

Hermes 端注意：
- 并行拉 quote/financials/signals/flows/holders/calendar/perspectives（data-access.md helper）。
- 报告分段发送（消息端）；结论段必含 评级+仓位+进场区间+止损+风险+尾注。
- 结论 append 入 journal（含 chain_role/evidence，storage.md schema）。
