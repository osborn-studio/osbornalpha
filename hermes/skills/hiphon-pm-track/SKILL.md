---
name: hiphon-pm-track
description: John Cameron 战绩记录与自我打分（Hermes 入口）。"战绩/命中率/复盘/记一笔/scorecard" → append-only journal + 确定性脚本对前复权K线打分（命中率/收益/按信号·证据·链角色校准）。
---

# Hiphon PM Track（Hermes 薄壳）

权威定义：`/Volumes/AIMATE_WORK/Developer/ClaudeCode/01_active/stock-monitor/skills/hiphon-pm-track/SKILL.md`（read_file 后照章执行）。

要点：
- 记一笔：按 storage.md §1.1 schema append 到 `~/.hiphon-pm/calls.jsonl`，只追加绝不改写。
- 打分：bash 跑 `/Volumes/AIMATE_WORK/Developer/ClaudeCode/01_active/stock-monitor/skills/hiphon-pm/scripts/score-calls.sh`（需 env `STOCK_MONITOR_SITE_PASSWORD`，hit 由脚本裁定非 LLM）。
- 复盘输出带 n；n<20 的桶只报计数不报百分比；主动认账 miss。
