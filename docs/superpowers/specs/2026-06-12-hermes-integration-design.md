# Hiphon PM × Hermes Agent 接口级融合 — 设计文档

> 状态: Approved · 2026-06-12
> 决策人: osborn（方案 A 接口级融合，批准动工）
> 目标: 在 Hiphon PM（stock-monitor）中"集成 Hermes Agent 核心模块、完全融合、核心模块自动升级"——以**接口级融合**实现，零 fork、零 vendoring。

## 1. 背景与定位

- **Hermes Agent** = NousResearch 开源自进化 agent（Python，本地 v0.14.0），已在本机运行：仓库 `/Users/osborn/hermes-agent`（origin=NousResearch/hermes-agent，无本地改动），运行时 `~/.hermes/`（gateway 多渠道 / cron / SOUL.md / skills / 学习闭环）。
- **融合目标**：让 John Cameron（Hiphon PM）跑在 Hermes 运行时上——Telegram/飞书随时问股、cron 自动周度决策包、战绩沉淀接 Hermes 记忆/学习闭环、技能自我进化。
- **"集成核心模块"的正确姿势**：不是把 Hermes 代码搬进仓库（升级地狱），而是把 Hiphon PM 做成 **Hermes skill 包**（agentskills.io 标准）接入其内核；内核 100% 保持上游，"自动升级"因此可持续成立。

## 2. 方案对比（已决策）

| 方案 | 自动升级 | 结论 |
|---|---|---|
| **A 接口级融合（skill 接入 + 上游自动拉取）** | git pull + 烟测 + 回滚，全自动 | ✅ 已批准 |
| B Vendor 核心模块进仓库 | 永久合并冲突 | ❌ |
| C Fork + submodule | 持续 rebase | ❌（仅当需改内核） |

## 3. 架构

```
Telegram / 飞书 / CLI / Discord
   → Hermes Gateway (~/.hermes, 上游原生)
   → ~/.hermes/skills/finance/hiphon-pm*/   ←符号链接← stock-monitor/hermes/skills/
   → Stock Monitor 生产 API + ~/.hiphon-pm/ 战绩 journal
```

一份源码两端可用：同一套技能内容，Claude Code 与 Hermes 都能调（SKILL.md 同构）。

## 4. 交付物（全部落在 stock-monitor 仓库）

1. `hermes/skills/hiphon-pm/SKILL.md` — John Cameron 人格入口（适配 Hermes/Telegram 消息节奏；引用 skills/hiphon-pm/references/*）
2. `hermes/skills/hiphon-pm-pick|track|deepdive/SKILL.md` — 三技能 Hermes 入口（薄壳引用现有内容与脚本）
3. `hermes/install.sh` — 符号链接安装到 `~/.hermes/skills/finance/`（幂等；卸载=删链接）
4. `hermes/upgrade-hermes.sh` — **核心模块自动升级**：
   - fetch 上游 → 无新 commit 静默退出
   - 记录旧 SHA → pull → `uv sync` 重装
   - 烟测：`hermes --version` ✓ / 4 个 hiphon skill 可见 ✓ / gateway 健康 ✓
   - 失败 → `git reset --hard 旧SHA` + 重装 → FAILED
   - 通知：Telegram（经 gateway）+ OSStack 看板
5. Hermes cron 两条：周五 16:30 周度决策包推送；周日凌晨自动升级
6. README 段落 + TODOS（可选项：迁移 hermes-agent 仓库到 SSD——本轮不做）

## 5. 错误处理 / 边界

- 取数失败 → "暂无数据" 纪律不变；合规尾注在 Hermes 端同样生效（写入 skill 文本）
- `~/.hiphon-pm/` journal 为 append-only 单行 JSONL，双端（Claude Code/Hermes）并发追加安全；升级脚本不触碰
- 升级脚本只动 `/Users/osborn/hermes-agent`，绝不触碰 `~/.hermes`（用户状态/记忆/凭证）
- ⚠️ `/Users/osborn/hermes-agent` 在内置盘（违反 SSD 规则）——本轮**不迁移**（运行中 venv/gateway，风险大），记 TODOS

## 6. 验收

① install 后 Hermes 列出 4 个 hiphon skill；② Telegram 问个股得到合规格式回答；③ 手动触发周度 cron 出推送；④ upgrade 脚本真跑一轮 + 模拟失败验证回滚；⑤ Claude Code 侧原有技能不受影响。

## 7. 非目标

不 vendor/不 fork；不迁移 hermes-agent 位置；不接 Hedge Fund AI 周度包全量（只接三技能 + 决策包雏形）；不动 HAPI。
