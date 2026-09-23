# 07 共享契约与交接包：Alpha 消费者交付

用户所称“第七站”是总纲的 07 共享契约与交接包。本目录实现 Alpha 可交付的固定契约清单与离线核验，不新增中央业务数据库，不代表 PA/Brain 云端部署协议已发布。

源码仓库 `osborn-studio/osbornalpha`，分支 `codex/s5-s6-alpha-integration`；本轮起点 `9eb2a19`。未提交的 `docs/audits/` 属于既有文件，原样保留。固定契约与工具的选定交付清单按 [manifest.json](manifest.json) 的 SHA-256 与字节数核对，源码版本以包含本目录的 Git commit 为准。

## 契约所有权与版本

| 契约 | 所有者 → 消费者 | 本地权威文件与状态 |
| --- | --- | --- |
| pa-source-pack / research-candidate-pack 1.0 | PA → Alpha | `src/lib/research/ingest/pa-v1/`，来自 PA `db842d3a88cc87074bc67c1935159bcb75e5ba9e`；[来源记录](../../../src/lib/research/ingest/pa-v1/PROVENANCE.md) |
| alpha-observation-contract/1.0 | Alpha → OSanalyst | [S4 schema、golden、政策/日历](../alpha-s4/HANDOFF-S5.md)，原 hash 固定 |
| evaluator-input-output/1.0 | OSanalyst → Alpha | `vendor/dsh-trade-strategy-evaluator-0.2.0.tgz`；[输入/结果 golden](../alpha-s6/fixtures/)，独立离线消费通过记录见 S6 |
| evaluator-rpc/1.0 | Alpha 服务端 → 受限客户端 | [S6 实现与复现](../alpha-s6/README.md)，服务端绑定 scope、重算、CAS/outbox；会话凭据不在共享包 |
| alpha-market-handoff/1.0 | 行情适配器 → Alpha 检查器 | [新增离线联调包](../alpha-s6/market-interface/README.md)，仅结构/证据引用自检，尚不能送入冻结引擎 |
| pa-ingest-receipt / pa-brain-transport / 云端 grant | PA/Brain | 仍属部署设计；不在 Alpha 冒称已冻结或验收 |

本仓冻结适配器包含共享信封定义；没有据此声称 Alpha 实现 Brain 加工、PA Reader 或所有跨仓协议。上游包自报 owner、权限、verified 均不形成授权。获准 S3.4 合成包副本与可信测试配置在 `src/lib/research/ingest/__fixtures__/s3/`，权限范围仍仅测试；不得直接作为实际用户的 trusted 配置。

## 可重复检查

```sh
# Node 22.19–22.x，已安装锁定依赖，从仓库根目录执行
npx tsx scripts/s7/verify-handoff.ts
npx tsx scripts/s6/verify-engine.ts
npx vitest run src/lib/research/ingest/candidate.test.ts src/lib/research/s6/market-handoff.test.ts src/lib/research/s6/handoff-cli.test.ts
```

第一条只覆盖 manifest 所列文件；文档、日志与其他源码不因处于同目录自动纳入。它检查固定清单、S4 原始/JCS hash、固定 vendor tarball、当前已安装引擎的旧 golden 重算/Replay、新行情 schema 与正反例。第一条不证明 node_modules 字节与 tarball 一致；第二条通过干净隔离安装固定包核验。它不解压外来包、不联网、不读取环境密钥、不连接数据库。对清单路径拒绝绝对路径、路径穿越与符号链接；单文件 2 MiB、最多 100 件、总量 16 MiB。manifest 必须来自可信 checkout：完整性不等于签名、发送者身份或权限。更换 manifest 和内容能够产生新的包，不得将其冒充原 commit。

真实数据库、HTTP、回执和恢复测试的复现命令/历史记录见 [S6](../alpha-s6/README.md)；本轮验证与 Claude 审计记录放在 [evidence](evidence/)。离线检查通过不能替代这些运行验收。

## 完成范围与待接续

交付固定契约清单、可执行检查器、合成正反例、接口负责人联调说明与验收边界。原手工记账组合和旧观察/Replay 保持原行为，本轮不新增迁移、不改生产开关。

第六站仍缺真实源口径/拆股/可用时间核验，以及兼容 ARCX 挂牌身份的新政策/引擎。接口由用户安排的负责人实现，接回第一步见 [行情交接](../alpha-s6/market-interface/README.md)。REL 目前仅 fixture_credit 工程验证，真实模型保持 not_run，成熟观察按事实 pending；不能把这些填成真实收益或计费验收。

回滚本轮只需停用离线检查脚本，无数据库回滚。已有 S6 新路径按既有 feature flag 关闭；冻结包和历史回执不能改写。交付不含密钥、生产数据或新授予的出站权限，也没有生产部署。
