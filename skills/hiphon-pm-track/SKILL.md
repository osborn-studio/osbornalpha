---
name: hiphon-pm-track
description: John Cameron 的战绩记录与自我打分。把每个买卖调用落入 append-only 日志，用确定性脚本对照前复权 K 线打分（命中率/平均收益/按信号组合校准），报出"我近 N 天战绩"。这是 Hiphon PM 的护城河，也是对 AI 选股过拟合/过度自信通病的正面解。Triggers on "战绩", "track record", "我的命中率", "复盘", "score my calls", "记一笔", "log this call", "我的持仓表现", "scorecard".
---

# Hiphon PM — Track Record & Self-Scoring (战绩记录)

让 John Cameron 对自己的每个调用负责：**记录 → 打分 → 复盘**。这是 v1 的"给建议就忘"到 v2 的"有据可查的战绩"的升级。

> 存储与打分规则见 `../hiphon-pm/references/storage.md`。纪律见 doctrine §9（校准）+ §10（战绩）。

## When to use

- 记一笔调用：用户/agent 做了买卖决策要落库（"记一笔：买入 600519 …"）
- 打分/复盘：用户问"我的战绩 / 命中率 / 复盘一下 / scorecard"
- pick 或 deepdive 给出买卖评级后，自动调用本技能把调用入库

## 核心纪律（不可违反）

1. **只追加**：`~/.hiphon-pm/calls.jsonl` append-only。改状态用 `event` 行，绝不编辑旧行。
2. **命中由脚本裁定**：跑 `score-calls.sh`，不由 LLM 自评命中。
3. **永远报 n**：命中率旁必带样本量；`n<20` 的校准桶只报计数不报百分比。

## 操作

### A. 记一笔调用 (log a call)
按 `storage.md` §1.1 的 `call` schema，append 一行到 `~/.hiphon-pm/calls.jsonl`：

```bash
mkdir -p ~/.hiphon-pm
CALL_ID="$(date -u +%Y-%m-%d)-600519SH-$(printf '%03d' $(( $(grep -c '"kind":"call"' ~/.hiphon-pm/calls.jsonl 2>/dev/null||echo 0) + 1 )))"
jq -nc --arg id "$CALL_ID" \
  '{kind:"call",call_id:$id,ts_utc:(now|todateiso8601),exchange_session:("A:"+(now|strftime("%Y-%m-%d"))),
    ticker:"600519.SH",name:"贵州茅台",market:"A",rating:"buy",thesis:"…",entry_basis:"next_open",
    entry_price_ref:1280.86,target_pct:18,stop_price:1180,stop_pct:-8,size_pct:8,horizon_days:250,
    signal_mix:["rsi_oversold","north_accum"],source:"hiphon-pm-pick"}' >> ~/.hiphon-pm/calls.jsonl
```
（实际字段由当次调用填充。`call_id` 用 `日期-去点ticker-序号`。）

### B. 关闭一笔（提前了结）
append 一条 `event`（不动原行）：
```bash
jq -nc '{kind:"event",call_id:"2026-06-03-600519SH-001",ts_utc:(now|todateiso8601),event:"manual_close",note:"逻辑被证伪，止损前主动撤"}' >> ~/.hiphon-pm/calls.jsonl
```

### C. 打分 + 复盘 (score & report)
```bash
export STOCK_MONITOR_SITE_PASSWORD=…    # 生产取数；或 STOCK_MONITOR_BASE_URL=http://localhost:3000
bash skills/hiphon-pm/scripts/score-calls.sh
cat ~/.hiphon-pm/scorecard.json | jq .
```
脚本对照**前复权 K 线**（`/api/kline` fqt=1，处理拆股/分红）确定性打分，写 `~/.hiphon-pm/scorecard.json`。

## 输出（复盘报告）

John Cameron 用人话讲战绩，带 n、认账：

```
# John Cameron · 战绩复盘 · <日期>
**已平仓**：N 笔 · 命中 M（命中率 X%，n=N）· 买入平均收益 +Y%
- 按评级：买入 命中 a/b · 卖出 命中 c/d
**持仓中（未实现）**：K 笔 · 浮动均值 +Z%
**校准**（仅 n≥20 的可靠桶）：
- A | rsi_oversold+north_accum：命中率 58%（n=24，可靠）
- A | momentum_up：4 中 6（n=6，样本不足，仅供参考）
**认账**：上次对 <X> 的 <买入> 判断错了——<一句话原因>。
> ⚠️ 以上为基于公开数据的个人决策辅助，不构成对任何第三方的投资建议。
```

## Guardrails
- 冷启动无数据：老实说"暂无战绩，判断基于逻辑与当前信号"，不编命中率。
- `n<20` 的桶绝不说成置信度百分比（doctrine §9）。
- 战绩数据是私密的，永远在 `~/.hiphon-pm/`，不进 git。
