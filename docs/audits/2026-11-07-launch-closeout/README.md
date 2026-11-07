# 美林时钟与宏观缓存发布记录（2026-11-07）

## 最新生产部署与 HTTP 核验（ab11d6e3）

release-main 独立会话于 2026-11-07 16:24:28 UTC 留存生产核验回执。代码提交为 `ab11d6e3b41a603169fda19df2db2d69fdad70c9`；精确 [Application checks 42390150149](https://github.com/osborn-studio/osbornalpha/actions/runs/42390150149) 与 [Macro source fixture checks 42390150168](https://github.com/osborn-studio/osbornalpha/actions/runs/42390150168) 均成功。生产部署 `dpl_66sLJmdeMoowiUjBVy1Pag49uXgK` 为 READY，部署地址 `https://stock-monitor-elfq9cex3-gilosbornhellos-projects.vercel.app`，生产别名检查指向同一部署；部署命令退出 0。该提交包含已合并的 #142–#153，包括 #146 鉴权切换隔离、#147 禁用态 I-3 准备、#148 F6 证据门、#150 manifest 回读优化及相应回归／CI。逐 PR 交付与剩余任务见 [任务清单](../../superpowers/plans/2026-11-07-cross-module-integration.md#remaining-release-tasks)。

脱敏机器回执与 PR 合并祖先核对见 [main-release-evidence.json](main-release-evidence.json)。release-main 对 `https://www.osbornalpha.com` 发起无 Cookie／Bearer 的只读请求：

- `/api/methodologies` 与 US/CN 公开判断均 200，三者响应 `codeVersion` 精确等于上述 SHA。
- `macro_regime@v2` 为 active/publishable，公式 hash 仍为 `dc26a628372facffa66bc51beb795f23ef755b0f51a82337b4bea17f0c2770ba`。方法注册行的旧 `registrationCodeVersion` 是注册来源，不是本次运行代码版本。
- US 为 overheat、CN 为 stagflation；两者仍 `calibration=insufficient`，不是已校准概率。
- transmission、cycle-table、policy-response 各重复两次，共 6 个匿名请求均为 401／unauthorized、`Cache-Control: no-store`。HTTP 核验退出 0，9 项检查全部通过。

**本次尚无新增父会话登录态浏览器证据。** 下方 `98e9a819` 的中美时钟／量化依据／真实来源抽屉记录仅属于该旧部署，不能作为 `ab11d6e3` 的浏览器验收。#146/#150 已部署，但未取得新版本登录态策略业务成功响应、登录／退出／账号切换、完整页面、原始下载或性能样本；匿名 401 耗时不能说明业务延迟。`dc47ba2e` 的 cycle 首次 16.114 秒仍是旧版本观察，不是新版本基准或回归结论；跨实例命中、受控冷启动与 p95/SLA 均未验证。

本次 release-main 没有更改 flags／licences，也未运行 cron；没有新的 settle apply 或校准作业验证。部署不会解除 I-3 的 `deferred_i3`、公司 CN PDF／issuer 方法门槛或 F6 禁用评测及人工 gold／许可／概率方法前置条件。后续浏览器和性能验收由父会话负责，owner 决策与剩余实现按任务清单逐项闭环。

## 上一阶段生产发布与中美核心流程（98e9a819）

2026-11-07 23:38:41（北京时间）生产检查：提交 `98e9a819d8f8ccc73de8f69df9feac09690014f3`，精确 [CI 42386242631](https://github.com/osborn-studio/osbornalpha/actions/runs/42386242631) 成功；部署 `dpl_BddX8KCD6DnK3a6KrVjtsaVEbikV` READY，绑定 `osbornalpha.com`。不可变部署地址为 `https://stock-monitor-5ebaim1ps-gilosbornhellos-projects.vercel.app`。策略与判断开关保持启用。该提交包含 #142 新 widget、#144 集成回归、#145 公司证据门以及 #148 评测准入修复；#148 的 merge commit `7adb5429` 已经祖先关系检查确认包含。不要把后来 main 合并的 #146/#151 或未发布的 #150 算作本次生产内容。#148 不解除禁用评测的许可证、人工 gold 或概率方法前置条件。

公开方法与中美判断卡均为 200，响应 codeVersion 精确匹配上述 SHA；`macro_regime@v2` 为 active/publishable，公式 hash 无漂移。US 为 overheat、CN 为 stagflation，仍为未校准判断。匿名 transmission 返回 401/no-store，settle preview 为 200/ok、errors=[]；本次是 idle preview，不是新的真实 apply。原始脱敏回执见 [widget-release-evidence.json](widget-release-evidence.json)。

原生 Chrome 既有登录会话已刷新真实 `/macro` 并完成中美核心流程，记录见 [widget-production-cua.json](widget-production-cua.json)：

- 新版全宽四阶段时钟及本地导航实际可见。US 当前过热、覆盖率 60% 及缺增长轴限制可见；展开过热量化依据，CPI 3.72%、2026-09-30、规则 `3% < inflation <= 4%`、权重 15、贡献 9 一致。
- US 点击来源进入真实抽屉，显示 BLS 经 FRED、`yoy_from_index@1` 及两个可读 `US_CPI_INDEX` 上游输入，CSV 行 322/310、列 2 与同一来源 SHA 可见。
- 切换 CN 时先清除 US 数据再绑定 CN。当前滞胀与衰退 21/21 并列、覆盖率 60% 明示；PPI 5%、权重 15、贡献 9，PMI 49.3、权重 15、贡献 6，总分 21。
- CN PPI 来源抽屉显示 NBS `data.stats.gov.cn`、`index_minus_100@1`、可读 `CN_PPI_INDEX` 输入与 JSON pointer `/data/1/values/0/value`。

这是 agent 的生产功能与界面核验，不是用户审美认可。未下载或重新计算原始证据字节；未完整重跑生产移动端、控制台、退出登录、账号切换、中文及浅色主题。下面 `dc47ba2e` 的 18 个缓存样本仍是旧版本历史样本，不是新部署性能基准；cycle 首次观察 16.114 秒的风险尚未用本次生产重测解除，#150 延迟优化没有随本次部署发布。

## 后续发布跟踪（#137–#142）

#137–#141 已合并并部署，精确提交为 `dc47ba2eb0768971f7362750bf504a90ceb68026`；[该提交 CI 42383255509](https://github.com/osborn-studio/osbornalpha/actions/runs/42383255509) 已通过。其中 #138 修复过期共享缓存的重复构建，并让认证策略请求绕过浏览器 HTTP 缓存；#137 是 F6 数据有效性与诊断修复，#140 是公司回放不再读实时收件箱，#141 是行业离线对账诊断与 I-3 决策计划。后三者不是对应整个模块完成，也没有启用 F6 禁用评测、实施 I-3 估值流水线或新增许可证／判断方法。

2026-11-07 22:59:58（北京时间）发布检查：Vercel `dpl_8D8nv5DAfZ6KEFz4yy1sBWnbsnq2`，`https://stock-monitor-osicj0o5j-gilosbornhellos-projects.vercel.app`，READY 并绑定 `osbornalpha.com`。宏观策略与判断 flags 保持开启。公开方法／中美判断卡返回 200，响应 codeVersion 为 `dc47ba2e`，v2 公式 hash 未变；匿名 transmission、cycle、policy 及重复 transmission 均为 401、`Cache-Control: no-store`；settle preview 为 200、`errors=[]`。脱敏证据见 [cache-release-evidence.json](cache-release-evidence.json)。

随后在原生 Chrome 已登录会话中，使用同源顺序 GET、`cache: 'no-store'` 并读取完整响应体，完成 6 个端点各 3 轮、共 18 个真实生产样本：**全部 200，全部 `Cache-Control: private, no-store`**。策略首轮为 process memo `miss`，后两轮为 `hit`；overview 不返回该 header。脱敏原始记录见 [cache-authenticated-cua.json](cache-authenticated-cua.json)。

| 端点 | 首次观察（ms） | 第 2 轮（ms） | 第 3 轮（ms） |
|---|---:|---:|---:|
| overview US | 861 | 1,691 | 1,000 |
| overview CN | 1,033 | 1,265 | 857 |
| transmission US | 2,618 | 1,573 | 849 |
| transmission CN | 1,822 | 979 | 1,140 |
| policy-response window=3 | 2,691 | 1,304 | 1,209 |
| cycle-table event_day | **16,114** | 1,167 | 663 |

这证明该已登录会话的成功响应 no-store 和进程缓存复用路径，不证明跨实例持久缓存命中、p95/SLA、退出登录／账号切换或完整页面首屏性能。首轮是“首次观察”，不是受控冷启动；cycle 的首次 miss 16.114 秒仍是明确的冷路径延迟问题，不能因重复请求变快而宣称已解决。不得用之前匿名 401 的耗时或本地构建耗时替代这组业务接口样本。

历史检查时，紧凑 widget 视觉重做另在 [当时的 draft PR #142](https://github.com/osborn-studio/osbornalpha/pull/142)，当前提交 `fb692b4c` 后还有未提交修正。忠实样式的本地真实 `MacroWorkbench`（端口 3121）已复核桌面表格不再裁切、来源抽屉回调绑定正确；这是本地组件接线证据，不是生产来源验证。独立键盘复核仍发现窄屏 Tab 到“方法与来源”时焦点按钮越出 viewport，修复与最终检查未完成，PR 保持 draft。该 widget 不在 `dc47ba2e` 中，不能随缓存发布一起宣布上线。下面 `e0b82b25` 的记录保留为上一阶段的实际生产证据。

当前更新：#142 已于 2026-11-07 15:24:03 UTC 合并为 `279b0e32ec9b5882e494285bdccf80f53fe589ec`，包含窄屏键盘焦点修正；上述 draft／未修复描述是历史状态。该合并不等于部署或中美登录态生产验收完成。

### 并行后续工作

以下为此前独立 CLI 会话的工作分工快照，均明确使用 `gpt-6.1-sol`；mmx 用于独立审计／验证建议。表内保留当时的进行中工作分工，不是当前完成或发布声明。各会话的新发现须经复现、修复测试、PR 和部署验证才能更新状态。

| 会话 | 当时范围 | 不能由此推定 |
|---|---|---|
| cache-regression | 过期、并发与缓存失效回归审查 | 生产 p95 或跨实例命中已达标 |
| macro-integration-audit | 宏观判断／快照／视图集成审查 | 未复验页面已通过 |
| industry-valuation-next | I-3 下一步与数值／口径缺口 | 已实现估值流水线或取得授权 |
| f6-evaluation-next | gold 准入与校准证据门审查 | 禁用评测可开启、已有概率方法 |
| company-readiness-next | 公司证据门、回放及剩余接线 | CN 定位、issuer 方法或人工黄金集已完成 |
| widget-correction | 裁切／来源回调本地复核通过，继续修窄屏键盘焦点可见性 | draft PR 已获视觉接受或已部署 |

## 上一阶段发布范围（e0b82b25）

本次目标为 `/macro` 登录态可见的四象限投资时钟，以及重复打开、刷新和策略读取的缓存优化。仅事实指标页面可用不代表美林时钟验收完成。

- #133 修复 JSONB containment 查询编码，避免真实判断补登记返回 500。
- #134 修复 `/manifest.json` 被认证中间件重定向的问题。
- #135 增加真正四象限展示、当前快照匹配、输入覆盖率／缺轴／并列说明，以及同页 canonical 导航。
- #136 加入跨实例纯事实缓存、同查询刷新保留内容，并减少重复读取。
- 合并后待验收提交：`e0b82b25d3f63cc45ac808aadc0de63541504e32`；该精确提交的 [完整 CI 42380190615](https://github.com/osborn-studio/osbornalpha/actions/runs/42380190615) 已通过。

## 生产部署与真实作业

2026-11-07 22:24（北京时间）已部署上述精确提交。Vercel `dpl_EUnPvGFah2xHt3zJE58KhcQtPRGb`，部署地址 `https://stock-monitor-mpjyhdjo1-gilosbornhellos-projects.vercel.app`，READY 并绑定 `osbornalpha.com`。`MACRO_STRATEGY_ENABLED` 保持启用，`MACRO_JUDGMENTS_ENABLED=1` 已随部署生效。

线上 judgments settle preview、真实 apply 与 calibrate preview 均 HTTP 200、`ok`；真实 apply 为 `success`、`errors=[]`、`compensation=done`。这是线上真实作业验证，不是只跑 preview。脱敏回执见 [production-crons.json](production-crons.json)。登录态界面与缓存测量另行记录，不以部署成功替代浏览器验收。

## 上一阶段登录态验收（e0b82b25）

功能部署成功，**整体视觉与性能验收尚未完成**。用户明确不接受当前视觉设计，后续将按 ChaosAI 参考重新设计；不能把本轮 US 功能检查称为用户视觉目标完成。

已验证：正式部署 US 登录态显示展开的四象限、过热分类、60% 输入覆盖率（明确非概率）、增长轴缺失、对应快照及未校准说明；展开依据可见真实 DFF／DGS10／CPI／PPI 观测、规则与权重。公开中美卡片与方法哈希、部署版本一致。`manifest.json` 为有效 JSON/200，匿名 overview 返回 401。

该阶段未完成：正式部署 CN 视觉／并列展示、最终截图、控制台无错误、首次进入／刷新／离开返回计时和 API 测量。后续 `dc47ba2e` 的 18 个 API 样本已在本记录上方单独列出，不能倒填为此旧版本的结果。跨账号、生产 TTL 边界／版本变更实验仍未执行；对应的确定性测试和设计审查不等于生产实测。该阶段完整分项见 [production-acceptance.md](production-acceptance.md)。

## 已确认的注册与数据依据

`macro_regime@v2` 已注册且 `publishable=true`；生产与合并代码公式哈希一致：`dc26a628372facffa66bc51beb795f23ef755b0f51a82337b4bea17f0c2770ba`。本次 I/O／缓存／UI 改动不改方法版本或历史判断。

此前 `upstream_version_mismatch` 来自旧 superseded 快照，属于正确弃权，不是当前快照缺陷。续跑补登记后，4 个快照扫描完成，最后回执 `compensation=done`、`errors=[]`。当前中美快照有真实 v2 判断：US `overheat`，CN `stagflation`；均为 `open`、`retrospective=false`、`as_of=2026-11-07`，未校准。

两地输入覆盖率均为 60%，不是分类概率。US 缺增长轴，CN 滞胀与衰退并列、margin=0。界面必须呈现这些限制；不绘制伪精确 XY 点，不把未校准分类称为概率。

## 缓存边界与测量口径

纯事实使用版本化 Next Data Cache，300 秒硬过期；key 包含快照、目录、部署 SHA 和输入／发布修订。每次请求在缓存外检查登录、功能开关、当前版本。判断结果和 collection 新鲜度不共享缓存，未知版本不复用。浏览器 `no-store` 只绕过 HTTP 缓存，不会绕过服务端事实缓存。

合并前只读测量记录在 [性能报告](../2026-11-07-macro-performance/README.md)。US/CN overview 暖路径约 543/552ms，是数据库读取样本，不是完整浏览器首屏或 p95。周期表冷扫描仍存在成本；必须记录上线后的首轮观察值和重复样本，不能将一次首轮样本称为受控冷启动，也不能把进程 memo header 当作跨实例命中证明。

## 历史与后续

[首次事实层发布与回滚](initial-facts-only-release.md) 保留先前故障、临时关闭判断开关及当时写权限阻塞的历史；这些不是本次最终状态。首次登录记录见 [acceptance.md](acceptance.md)。

上一阶段后续清单（当前部署状态以上方 `ab11d6e3` 章节为准）：补齐生产移动端、中文／浅色主题、控制台、退出登录／账号切换与原始文件下载验证，并由用户评价视觉目标；继续完成 cycle 首次 miss 优化的审批、部署及新浏览器样本。未达性能预算或未验证的跨实例条件单独列为剩余事项，不抹去本次中美核心流程成功的发布证据。
