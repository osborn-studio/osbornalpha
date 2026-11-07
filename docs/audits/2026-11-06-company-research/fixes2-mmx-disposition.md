# fixes2 MiniMax 复审处置（指挥核对，2026-11-07）

MiniMax 只看到差异与少量上下文，不能读仓库；以下逐条对照代码处置。

## fixes2-lineage（536f3509）
| # | 处置 | 理由 |
|---|---|---|
| 1 | 驳回 | 物化分支 filings 为空时，`buildGated` 回落 `filingsOfIssuer` 按成员读取，受 `asOf=today` 限制，且随后逐事实校验 filing 归属（同发行人、同市场），见 `route.ts` buildGated |
| 2 | 驳回 | `fact()` 读的是删除不合格项之后的 `byId`，被删事实不可达 |
| 3 | 驳回 | 归属校验为 `filing.issuerId === fact.issuer_id && filing.market === fact.market`，并且成员集合校验；lineage 调用方必须显式提供归属，否则丢弃 |
| 4 | 接受为已知 | 回落读取同样受 `asOf` 限制；两路来源都只取已发布 filing；不构成越界 |
| 5、6 | 驳回 | 门槛按精确 fact_id 的证据判定；事实行不可变，物化行引用的事实与证据与读取时刻无关；`asOf=today` 只限制可见性 |
| 7 | 接受为设计 | 无归属的 lineage filing 被丢弃（失败关闭），不会放行 |

## fixes2-task19（0b6ae1a8）
| # | 处置 | 理由 |
|---|---|---|
| 1 | 驳回 | 两个无消费者的清单条目按 Opus 复审 P3-3 有意删除；规格 §17 已记录 |
| 2 | 接受为现状 | `baseURL` 由 Playwright 配置提供；非本机时整套跳过已验证（13 skipped） |
| 3–5 | 待 e2e 实跑验证 | 等待条件只影响测试稳定性，不影响公共数据；本机 Playwright 运行时若出现不稳定再修 |
