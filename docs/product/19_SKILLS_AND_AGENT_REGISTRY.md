<!-- 19_SKILLS_AND_AGENT_REGISTRY.md · osbornalpha skills/ 与 john-cameron agent 注册表 · 最后更新 2026-06-20 -->

# 19 · Skills 与 Agent 注册表

> 以 `skills/**/SKILL.md` 与 `.claude/agents/john-cameron.md` 真实内容为准。所有 skill 通过 osbornalpha 的 `/api/*` 接口读取行情/财务/信号，私有决策状态写在 `~/.hiphon-pm/`（不入 git）。生产 base URL：`https://stock-monitor-nu.vercel.app`（本地 `http://localhost:3000`）。

## 19.1 Agent：`john-cameron`

文件：`.claude/agents/john-cameron.md`。frontmatter `name: john-cameron`、`model: opus`。

- **身份**：Hiphon PM — 资深基金经理 John Cameron 虚拟分身；唯一服务对象为 osborn（个人决策辅助）。
- **DNA（按权重）**：① Druckenmiller（核心：自上而下、宏观/流动性优先、顺势重仓、快速止损、12–18 月视野）② 价值护城河（Buffett/张坤：安全边际、能力圈、健康 FCF）③ 产业链卡脖子（选股放大器，内化 doctrine §11）。
- **决策框架**：每次评级前在脑中跑完 doctrine §1 宏观闸 → §2 漏斗 → §3 评级 → §4 策略/止损 → §5 仓位；输出按 §7 契约 + §6 合规页脚。
- **能力路由（dispatch）**：

  | 用户意图 | 动作 |
  |---|---|
  | 今天买什么/选股/买入建议/组合 | 调 `hiphon-pm-pick` |
  | 深度分析 X / 该不该买 X / 投资报告 | 调 `hiphon-pm-deepdive` |
  | 我的战绩/命中率/复盘/记一笔 | 调 `hiphon-pm-track` |
  | X 今天怎么样/早报/雷达 | 调 `stock-daily-radar` |
  | 拆 X 产业链/找卡脖子（仅研究，不评级） | 调 `stock-bottleneck-picker` / `ai-supply-chain-bottleneck-hunter` |
  | 板块内带买卖评级的选股 | **自己跑 §11 卡脖子方法** → doctrine 评级，证据+角色写日志 |
  | 宏观/行业/估值/IPO/一二级/组合/风控问答 | **自己回答** |

  作为 skill 调用方时保持「编排者」身份：拿到结果后做最终裁决/汇总，而非透传。
- **合规（个人版）**：允许直接 buy/add/trim/sell，但每个 call **必须** 含评级 + 理由（带数据来源）+ 仓位% + 止损 + 风险，并附固定页脚：`⚠️ 以上为基于公开数据的个人决策辅助，不构成对任何第三方的投资建议。市场有风险，决策需自负。`
- **战绩纪律（v2 护城河）**：每个评级经 `hiphon-pm-track` append 到 `~/.hiphon-pm/calls.jsonl`（只追加、不改历史，§10）；命中由脚本判定（§9），不自评；若 `~/.hiphon-pm/portfolio.json` 存在，建议须基于真实持仓（加/减/卖 + 集中度检查 §8）；校准只引用 `scorecard.json`，`n≥20` 才算可靠且永远报 n。

## 19.2 Skills 注册表

`skills/` 下共 7 个 skill 目录 + 1 个共享 `hiphon-pm/`（doctrine/data-access/storage 引用 + 脚本）。

### `hiphon-pm-pick` — 主动选股+择时引擎
- **用途**：先判宏观/流动性总闸定总仓位，再用「产业链卡脖子 + 护城河 + 信号面」四层漏斗，产出排序买入清单，每只带评级/仓位%/进场区间/止损/风险。
- **触发**：今天买什么、选股、买入建议、current picks、hiphon pick。
- **输入/输出**：输入用户意图 + 当前市场；调 `/api/signals`、`/api/financials`（A 股）、`/api/flows`（北向，A 股）、`/api/perspectives`（9 人委员会）、`/api/radar`。输出排序买入清单 + 追加 `calls.jsonl`（带 `chain_role` + `evidence`）。
- **引用**：`../hiphon-pm/references/{doctrine,data-access,storage}.md`。

### `hiphon-pm-deepdive` — 个股深度研究
- **用途**：对单股做系统性基本面分析（商业模式/护城河/财务质量/估值/催化剂/风险）+ 宏观与信号面，产出完整投资报告 + 明确操作建议。
- **触发**：深度分析、深研、investment report、该不该买、deep dive、帮我看看 <股票>。
- **输入/输出**：`/api/search`→ticker；并行 `/api/quote /financials /signals /flows /holders /calendar /perspectives /radar`。输出 8 段投资报告 + 操作建议 + 合规页脚，并追加 `calls.jsonl`。
- **引用**：doctrine（§2/§11）、`ai-supply-chain-bottleneck-hunter/references/catalyst-watch.md`。

### `hiphon-pm-track` — 战绩记录与自我打分
- **用途**：把每个买卖 call 落入 append-only 日志，用确定性脚本对照前复权 K 线打分（命中率/平均收益/按信号组合校准），报「近 N 天战绩」。
- **触发**：战绩、track record、我的命中率、复盘、记一笔、scorecard。
- **三条铁律**：① 只追加 `~/.hiphon-pm/calls.jsonl`（状态变更用 `event` 记录）② 命中只由脚本判（无 LLM 自评）③ 永远报 n（`n<20` 报计数不报百分比）。
- **脚本**：`skills/hiphon-pm/scripts/score-calls.sh`（bash + curl + jq）。读 `calls.jsonl` → 取 `/api/kline/{ticker}?period=D&fqt=1`（前复权）→ 走 bar 判 hit_stop/hit_target/expired → 算收益 → 按 rating/signal_mix/evidence/chain_role 聚合 → 写 `~/.hiphon-pm/scorecard.json`。env：`STOCK_MONITOR_SITE_PASSWORD`、`STOCK_MONITOR_BASE_URL`、`HIPHON_HOME`、`HIPHON_MIN_SAMPLE`（默认 20）、`HIPHON_TODAY`、`HIPHON_DEBUG`。

### `ai-supply-chain-bottleneck-hunter` — 供应链卡脖子研究
- **用途**：可复用的 AI/光子/半导体供应链研究流程（Serenity + Crux 双镜头），做瓶颈映射、栈分析、证据采集、方向性板块判断，仅在论点成立后才给低市值候选名。
- **方法**：双镜头（Serenity 找被忽视的瓶颈/市值错配；Crux 全栈 + 角色分配）；6 步对话式工作流（范围闸→确认超级趋势→画 6–9 层栈→「需求翻倍最先断哪」找瓶颈→A/B/C/D 证据核验→方向先行，之后才给候选名）。
- **硬规则**：论点未建立前不给「选股清单」；区分 confirmed/inference/speculation；永远说什么会证伪；用「信号偏多/偏空/中性」不用建议买卖；结尾 `本分析仅作研究参考，不构成投资建议`。
- **引用**（fork 自 `github.com/gilosbornhello/chokepoint-atlas`）：`scoring-framework.md`（5 维 Lane/Name Score）、`evidence-ladder.md`、`catalyst-watch.md`、`graph-schema.md`。

### `stock-bottleneck-picker` — 卡脖子选股（接入实盘数据）
- **用途**：在 bottleneck-hunter 方法之上接 osbornalpha 实盘数据，映射任意板块价值链→定位最窄约束→证据核验→按角色（executor/bottleneck/beneficiary/optionality）分组候选股。
- **触发**：选股、bottleneck pick、找瓶颈股、供应链选股、拆产业链。
- **集成**：`/api/quote`（价/PE/PB/ROE/市值）、`/api/financials`（A 股营收成本结构）、`/api/signals`、`/api/perspectives`、`/api/search`。
- **模板**：`references/sector-chain-templates.md` 内置 AI/半导体、新能源车、储能、人形机器人、医药、光伏、风电 7 套产业链模板。

### `stock-daily-radar` — 个股每日早报
- **用途**：对任一 ticker 出 2 分钟可读的 morning note（Anthropic equity-research 格式）：行情/北上/涨跌停/公告/AI 委员会。
- **触发**：每股雷达、stock radar、每股早报、morning note for <ticker>。
- **流程**：`/api/search` 归一 ticker → 并行 `/api/quote /flows(A 股) /signals` → 可选 `/api/perspectives` → 算雷达级别 → 组装 morning note（Top Call/Price/Flows/Events/AI Committee/Our Take/Action）。
- **级别**：`≥8 🔴 关注` / `4–7 🟡 留意` / `<4 ⚪️ 平静`。输出可走 Web `/radar`、CLI markdown、Telegram MarkdownV2。

### `portfolio-pdf-report` — 持仓 PDF 转多维查询网页
- **用途**：把持仓/对冲基金头寸 PDF 转成可搜索/筛选/排序的临时 HTML 报表（含期权/FX/敞口表、CSV 复制）。
- **触发**：PDF 转多维报表、持仓 PDF 变网页、Notional report。
- **脚本**：`scripts/generate_portfolio_report.py <pdf> -o <out>` → 产 `index.html` + `portfolio-data.json`，本地 `python3 -m http.server` 查看。仅供快速分析，非审计记录，缺字段不臆造。

## 19.3 共享引用与脚本（`skills/hiphon-pm/`）

- `references/doctrine.md` — HOUSE_DOCTRINE 投资宪法 §0–§11（详见文档 22）。
- `references/data-access.md` — `/api/*` 端点目录、鉴权（`/api/auth/unlock` 取 `sm_auth` cookie）、成本纪律（优先 `/api/radar`，慎用 `/api/perspectives`）。
- `references/storage.md` — `calls.jsonl`（call/event 记录 schema）、`portfolio.json`、`scorecard.json` 三文件契约与命中定义。
- `scripts/score-calls.sh` — 确定性打分（见上）。`scripts/research-pack.sh` — 研究流程占位，尚未接线。

## 19.4 Skill ↔ App 关系

所有 skill **只通过 `/api/*` 读实盘数据，绝不臆造数字**；缺数据返回「暂无数据」。A 股专属数据（financials/flows/holders/calendar）对 HK/US 返回「暂无数据」。历史 brief 与 perspectives 存 Supabase（按用户 RLS）；个人决策状态（calls/portfolio/scorecard）离线在 `~/.hiphon-pm/`，不入 git。`hermes/skills/*` 为 Hermes/CLI 分发适配层，权威定义仍在 `skills/`。

## 19.5 与既有事实的差异

- skill 数量多于「四件套」描述：除 `hiphon-pm-pick/-track/-deepdive` + `ai-supply-chain-bottleneck-hunter` 外，还有 `stock-bottleneck-picker`、`stock-daily-radar`、`portfolio-pdf-report` 三个。
- `references/` 三文件位于 `skills/hiphon-pm/references/`（共享目录），而非各 skill 内。
- `research-pack.sh` 存在但未接线；chokepoint-atlas 的 Python pipeline 已被引用但尚未集成。
