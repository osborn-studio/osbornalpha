# S5/S6 本地联调交付

当前：S5 固定引擎已接入 Alpha；S6 合成材料的数据库、HTTP、浏览器与回放链路已跑通。**第六站整体尚未验收完成**：真实行情的拆股/时间证据、成熟观察窗口及真实 REL 运行与费用核对未完成。没有部署生产。

2026-09-22 续做：新增 [REL 预算与恢复工程验证](REL-READINESS.md)，并发现真实 SPY 的 ARCX 身份与固定引擎 XNYS 限制冲突，已阻断错误映射并形成 [下一版政策交接](POLICY-NEXT.md)。成熟观察 pending 与 Jev not_run 可如实保留，不必为了结束六站制造结果；当前工程仍缺兼容实源身份的版本化行情链及完整实源证据。

2026-09-22 行情并行交接：新增 [行情接口联调包](market-interface/README.md) 与 [07 共享契约交接](../alpha-s7/README.md)。离线检查覆盖结构、证据哈希、保守接收时间、拆股乘数、缺日及标的/SPY 双包对齐；真实身份、授权与原始响应解析尚待核验。接口由用户安排的负责人实现。

2026-09-26 E3a/E3b：引擎 0.3.0 与 market-policy/2.0 已采用，真实证券路径对「2.0 观察 + 已证明身份的交接包 + `ALPHA_S6_REAL_MARKET=1`」打开；见 [E3b 交接](../alpha-e3b/README.md)。

## 已实现

- 固定 `dsh-trade-strategy-evaluator@0.2.0` 包，SHA-256 `a071a1fcfc2499a54af5a7ced2f18d57ff7cd61d8aa17f8af3def13777fc5869`；干净离线消费者的 golden/Replay 一致。
- Alpha 内部报告与 5/20/60 窗口、服务端准备/重算、回放导出。用户不需要 DSH，原有手工组合记账不变。
- PostgreSQL owner RLS、短期 evaluator session、不可变行情/结果、CAS、幂等与 outbox 原子写入；提交结果由服务器从权威输入重算并保存。
- 新评估同时检查 as-of 时点和提交时点的权威行情集合；精确重试仍返回原回执。来源撤销后拒绝在线读取、提交和导出。
- Replay 包含冻结输入、结果、回执以及行情原始响应和证据；超出报告最近 100 项的历史结果也可导出。
- REL 仅 `disabled` / 合成 `fixture`，重复显示也追加暴露记录。没有真实供应商调用或计费实现，不据此声明真实 shadow 已完成。
- 新增隔离 fixture_credit 账本：reserved/incurred/unknown/settled/released、并发额度、hard stop、显式幂等对账、调用前中断恢复；不接付费账户。
- 数据库之外的本地审计回执与备份恢复回放。当前恢复是同机隔离数据库验证，不能充当异地灾备验收。

## 验证证据

| 验证 | 结果/证据 |
| --- | --- |
| Alpha 全量单测/集成 | 151 文件、1,173 测试通过，含真实隔离 PostgreSQL 和 HTTP；[日志](evidence/alpha-tests.log) |
| 全新数据库迁移 | 29 个迁移成功；集成测试使用新库、无生产连接 |
| Next 构建 | [构建日志](evidence/build.log) |
| Node 22 引擎 | 67 测试通过；[日志](evidence/s5-node22-engine.log) |
| OSanalyst 全量检查 | 修复 Node 22 TAP 摘要守卫后 310 测试通过；[日志](evidence/s5-node22-check.log)。原 308 测试通过但摘要守卫误报失败的旧日志保留供追溯 |
| 干净消费者 | [固定包校验](evidence/clean-consumer.json) |
| 实际浏览器 | 授权 S3.4 包→观察→报告→计算→导出→重启读取→撤销清屏、320px；[记录](evidence/browser.json)。该浏览器记录在最后一轮服务器加固前取得 |
| 备份恢复 | 原观察不变、结果 Replay 相同、外部回执哈希保留；[记录](evidence/restore.json)。同机验证，off_host=false |
| 实源只读探测 | 新浪 IBM/SPY 日线已取得；[来源核查与尚缺证据](MARKET-SOURCES.md) |

此前续做验证覆盖 30 个全新数据库迁移、151 文件/1,176 项全量测试，以及构建和 lint，见 [续做测试](evidence/continuation/alpha-tests.log)、[构建](evidence/continuation/build.log)、[lint](evidence/continuation/lint.log)。旧证据保留原始时间范围，不冒称旧浏览器记录已覆盖本轮新增会计恢复逻辑；新增部分由真实 PostgreSQL 集成测试验证。

Claude CLI 使用 `claude-opus-5-5` 独立审计，提示输入有逐文件哈希，工具禁用。首轮发现的调用者选择 as-of/行情集合问题已修复；第三轮未发现 P0/P1，其 P2 处理见 [处置表](AUDIT-DISPOSITION.md)，后续小修由本地测试验证，未重复声称获得外部审计。测试通过不等于真实行情或真实 REL 验收完成。

2026-09-22 双包联调续做：本轮 [测试与核验](../alpha-s7/evidence/README.md) 覆盖 154 个文件/1,220 项测试、构建、lint、typecheck 和 48 件固定清单；Opus 5.5 复审此前 P1 已关闭，详见 [处置](../alpha-s7/evidence/PAIR-AUDIT-DISPOSITION.md)。真实行情与新版引擎仍未验收。

## 本地复现

需要 Node 22.19–22.x、PostgreSQL 17、已安装依赖。所有脚本显式使用本地隔离库状态文件，不读取开发者 `.env`。

```sh
npx tsx scripts/s4/local-db.ts
# 将返回的 stateFile 放入 S4_TEST_STATE；其中连接凭据不得复制进报告。
S4_TEST_STATE=<stateFile> npm test -- --reporter=dot
npm run typecheck
npm run lint
npm run build
npx tsx scripts/s6/verify-engine.ts
```

浏览器演示依次使用 `scripts/s6/seed-acceptance.ts`（显式授权包/配置/外部回执目录）、`local-web.ts`、`browser-smoke.ts`；具体位置参数见脚本。真实公开接口探测可运行 `npx tsx scripts/s6/probe-public-market.ts <private-output-directory>`，输出只是能力探测，不能直接导入真实观察。

下一步应实现真实行情证据解析与验收、真实 REL 的授权/预算/结算闭环，再按总纲补齐整体验收；不得将这些未完成项记为通过，也不得把同一组合后续 M1/M2/M3 功能混入本次完成声明。
