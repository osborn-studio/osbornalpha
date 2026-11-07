# 美林时钟与宏观缓存发布记录（2026-11-07）

## 后续发布跟踪（#137–#142）

#137–#141 已合并并部署，精确提交为 `dc47ba2eb0768971f7362750bf504a90ceb68026`；[该提交 CI 42383255509](https://github.com/osborn-studio/osbornalpha/actions/runs/42383255509) 已通过。其中 #138 修复过期共享缓存的重复构建，并让认证策略请求绕过浏览器 HTTP 缓存；#137 是 F6 数据有效性与诊断修复，#140 是公司回放不再读实时收件箱，#141 是行业离线对账诊断与 I-3 决策计划。后三者不是对应整个模块完成，也没有启用 F6 禁用评测、实施 I-3 估值流水线或新增许可证／判断方法。

2026-11-07 22:59:58（北京时间）发布检查：Vercel `dpl_8D8nv5DAfZ6KEFz4yy1sBWnbsnq2`，`https://stock-monitor-osicj0o5j-gilosbornhellos-projects.vercel.app`，READY 并绑定 `osbornalpha.com`。宏观策略与判断 flags 保持开启。公开方法／中美判断卡返回 200，响应 codeVersion 为 `dc47ba2e`，v2 公式 hash 未变；匿名 transmission、cycle、policy 及重复 transmission 均为 401、`Cache-Control: no-store`；settle preview 为 200、`errors=[]`。脱敏证据见 [cache-release-evidence.json](cache-release-evidence.json)。

该轮使用公开和匿名 HTTP 检查，**没有完成登录态成功响应 `private, no-store`、退出登录界面、跨实例缓存命中或浏览器冷暖计时验收**。不能用匿名 401 的耗时代替业务接口耗时；之前的 `e0b82b25` US 登录结果也不是 `dc47ba2e` 的新视觉验收。

紧凑 widget 视觉重做另在 [draft PR #142](https://github.com/osborn-studio/osbornalpha/pull/142)。本地测试／构建结果不能替代视觉验收；浏览器复核发现桌面展开表格裁切，修复和重新检查仍在进行。该 widget 不在 `dc47ba2e` 中，不能随缓存发布一起宣布上线。下面 `e0b82b25` 的记录保留为上一阶段的实际生产证据。

### 并行后续工作

以下独立 CLI 会话均明确使用 `gpt-6.1-sol`；mmx 用于独立审计／验证建议。表内是进行中工作分工，不是完成或发布声明。各会话的新发现须经复现、修复测试、PR 和部署验证才能更新状态。

| 会话 | 当前范围 | 不能由此推定 |
|---|---|---|
| cache-regression | 过期、并发与缓存失效回归审查 | 生产 p95 或跨实例命中已达标 |
| macro-integration-audit | 宏观判断／快照／视图集成审查 | 未复验页面已通过 |
| industry-valuation-next | I-3 下一步与数值／口径缺口 | 已实现估值流水线或取得授权 |
| f6-evaluation-next | gold 准入与校准证据门审查 | 禁用评测可开启、已有概率方法 |
| company-readiness-next | 公司证据门、回放及剩余接线 | CN 定位、issuer 方法或人工黄金集已完成 |
| widget-correction | 修展开表格裁切并复验多尺寸 UI | draft PR 已获视觉接受或已部署 |

## 当前发布范围

本次目标为 `/macro` 登录态可见的四象限投资时钟，以及重复打开、刷新和策略读取的缓存优化。仅事实指标页面可用不代表美林时钟验收完成。

- #133 修复 JSONB containment 查询编码，避免真实判断补登记返回 500。
- #134 修复 `/manifest.json` 被认证中间件重定向的问题。
- #135 增加真正四象限展示、当前快照匹配、输入覆盖率／缺轴／并列说明，以及同页 canonical 导航。
- #136 加入跨实例纯事实缓存、同查询刷新保留内容，并减少重复读取。
- 合并后待验收提交：`e0b82b25d3f63cc45ac808aadc0de63541504e32`；该精确提交的 [完整 CI 42380190615](https://github.com/osborn-studio/osbornalpha/actions/runs/42380190615) 已通过。

## 生产部署与真实作业

2026-11-07 22:24（北京时间）已部署上述精确提交。Vercel `dpl_EUnPvGFah2xHt3zJE58KhcQtPRGb`，部署地址 `https://stock-monitor-mpjyhdjo1-gilosbornhellos-projects.vercel.app`，READY 并绑定 `osbornalpha.com`。`MACRO_STRATEGY_ENABLED` 保持启用，`MACRO_JUDGMENTS_ENABLED=1` 已随部署生效。

线上 judgments settle preview、真实 apply 与 calibrate preview 均 HTTP 200、`ok`；真实 apply 为 `success`、`errors=[]`、`compensation=done`。这是线上真实作业验证，不是只跑 preview。脱敏回执见 [production-crons.json](production-crons.json)。登录态界面与缓存测量另行记录，不以部署成功替代浏览器验收。

## 登录态验收与当前结论

功能部署成功，**整体视觉与性能验收尚未完成**。用户明确不接受当前视觉设计，后续将按 ChaosAI 参考重新设计；不能把本轮 US 功能检查称为用户视觉目标完成。

已验证：正式部署 US 登录态显示展开的四象限、过热分类、60% 输入覆盖率（明确非概率）、增长轴缺失、对应快照及未校准说明；展开依据可见真实 DFF／DGS10／CPI／PPI 观测、规则与权重。公开中美卡片与方法哈希、部署版本一致。`manifest.json` 为有效 JSON/200，匿名 overview 返回 401。

未完成：正式部署 CN 视觉／并列展示、最终截图、控制台无错误、首次进入／刷新／离开返回计时、18 个 API 测量样本。测试脚本已准备但尚未执行。跨账号、生产 TTL 边界／版本变更实验也未执行；对应的确定性测试和设计审查不等于生产实测。完整分项见 [production-acceptance.md](production-acceptance.md)。

## 已确认的注册与数据依据

`macro_regime@v2` 已注册且 `publishable=true`；生产与合并代码公式哈希一致：`dc26a628372facffa66bc51beb795f23ef755b0f51a82337b4bea17f0c2770ba`。本次 I/O／缓存／UI 改动不改方法版本或历史判断。

此前 `upstream_version_mismatch` 来自旧 superseded 快照，属于正确弃权，不是当前快照缺陷。续跑补登记后，4 个快照扫描完成，最后回执 `compensation=done`、`errors=[]`。当前中美快照有真实 v2 判断：US `overheat`，CN `stagflation`；均为 `open`、`retrospective=false`、`as_of=2026-11-07`，未校准。

两地输入覆盖率均为 60%，不是分类概率。US 缺增长轴，CN 滞胀与衰退并列、margin=0。界面必须呈现这些限制；不绘制伪精确 XY 点，不把未校准分类称为概率。

## 缓存边界与测量口径

纯事实使用版本化 Next Data Cache，300 秒硬过期；key 包含快照、目录、部署 SHA 和输入／发布修订。每次请求在缓存外检查登录、功能开关、当前版本。判断结果和 collection 新鲜度不共享缓存，未知版本不复用。浏览器 `no-store` 只绕过 HTTP 缓存，不会绕过服务端事实缓存。

合并前只读测量记录在 [性能报告](../2026-11-07-macro-performance/README.md)。US/CN overview 暖路径约 543/552ms，是数据库读取样本，不是完整浏览器首屏或 p95。周期表冷扫描仍存在成本；必须记录上线后的首轮观察值和重复样本，不能将一次首轮样本称为受控冷启动，也不能把进程 memo header 当作跨实例命中证明。

## 历史与后续

[首次事实层发布与回滚](initial-facts-only-release.md) 保留先前故障、临时关闭判断开关及当时写权限阻塞的历史；这些不是本次最终状态。首次登录记录见 [acceptance.md](acceptance.md)。

下一步：完成用户要求的视觉重做 → 新提交 CI／部署 → 重做中美登录态视觉与证据验收 → 执行浏览器性能样本并报告范围。未达性能预算或未验证的跨实例条件单独列为剩余事项，不抹去本次成功的功能发布证据。
