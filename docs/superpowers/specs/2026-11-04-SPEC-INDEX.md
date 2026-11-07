# 研究重建规格总览（2026-11-04）

总纲：`docs/research/chaosai-integration-2026-11-04/EXPERT_PLAYBOOK_AND_BRIEF.md` §5。所有规格设计在 Fable 5.1 上完成，每份都经 Codex CLI（gpt-6-astra，medium）多轮对抗审计，报告与处置表在 `docs/audits/2026-11-04-<slug>/`。实施阶段：代码由 Opus 5.5 子代理按计划逐任务完成，每个任务再经 Codex 审计。页面类规格的 GUI 与 UI flow 按 owner 规则先在 Claude Design 画布上设计（各规格末尾的"待设计清单"）。

| 规格 | 文件 | 稿次 | Codex 终审 | 审计目录 | 当前实施状态 / 下一步（2026-11-07） |
|---|---|---|---|---|---|
| 数据底座一（F1 发行人 + F5 质量设施） | `2026-11-04-data-foundation-design.md` | 已实施（§14 偏差） | 任务级审计 | — | PR #100 已合并 |
| 数据底座二（F2 披露事实库） | `2026-11-04-data-foundation-2-disclosure-facts-design.md` | 8 | 第八轮："ready for an implementation plan with owner decisions A/B/C pending" | `2026-11-04-data-foundation-2/`（01–15 + README） | PR #102、#104 已合并；生产记录见 #113 |
| 数据底座三（F1b 标识符 + F5 对账与日历新鲜度） | `2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md` | 6 | 第五轮（增量 + 落地代码核对）T1–T15、第六轮确认 U1–U3 均按规定修法落实 | `2026-11-04-data-foundation-3/`（01–07 + 03 处置） | PR #108 已合并；后续数据覆盖与人工核对见运行手册 |
| F3 披露文档管道 | `2026-11-04-document-pipeline-design.md` | 6 | 第五轮（增量 + 落地代码核对）"not ready"；R5-1–13 已按原方案实现 | `2026-11-04-document-pipeline/` | PR #114 已合并；公司来源抽屉集成 #118、RPC 迁移锁定 #126 |
| F4 判断层框架 | `2026-11-04-judgment-framework-design.md` | 5 | 第四轮 "not ready"；R01–R06 已按原方案实现，未复审 | `2026-11-04-judgment-framework/` | PR #117 已合并；宏观 v2 修复 #129、#132，许可 #131；生产注册与开关另行验收 |
| F6 评测与黄金集 | `2026-11-04-evals-and-gold-sets-design.md` | 6 | 第 6 稿已按计划 `2026-11-06-evals-and-gold-sets.md` 实施，见 §18.1 | `2026-11-04-evals-gold-sets/` | PR #106、#127、#137、#148 已合并；#148 加强 gold 准入及校准证据结构校验，不认证来源真伪或人工准确性；extraction_gold / judgment_calibration 仍禁用，许可、人工 gold、概率方法／导出／阈值／runner 未闭环 |
| 行业研究 | `2026-11-04-industry-research-design.md` | 5 | 第四轮 "not ready"；U1–U6 已按原方案实现，未复审 | `2026-11-04-industry-research/` | PR #107、#123、#141、#147、#153 已合并；#147 仅禁用态 I-3 输入准备，#153 为独立日期入口回归；official / valuation 仍 deferred_i3；H／PB 口径、SQL 比较／舍入、授权、gold、发布激活和行业方法仍待闭环 |
| 公司研究与跟踪 | `2026-11-04-company-research-design.md` | 5 | 第四轮 "not ready"；#40/#57–#60 已按原方案实现，未复审 | `2026-11-04-company-research/` | PR #115、#118、#124、#140、#145、#149 已合并；#145 绑定请求 issuer 与 fact/run 来源，#149 为独立 HTTP 证据门回归；来源抽屉默认开，公司判断默认关；CN PDF 定位、issuer 方法、独立黄金集及运维验收仍待闭环 |
| 外资研报 | `2026-11-04-foreign-research-design.md` | 4 | 第四轮 "READY WITH P2 FIXES"；三条 P2 已实现 | `2026-11-04-foreign-research/` | 依赖 F3/F4；owner 决策 D1–D7；画布 |
| 宏观工作台（P1+P2） | `2026-11-04-macro-workbench-design.md` | 2 | 2026-11-06 增量轮 "not ready"（M1–M26 全部接受并落实） | `2026-11-06-macro-workbench/` | PR #109 已合并；P3/P4 经 #111、#112 接入；#119 生产事实验证，#128 性能优化，#130 入口改为 /macro |

美林时钟发布增量：#133 JSONB 查询修复、#134 manifest、#135 四象限与证据约束、#136 跨实例纯事实缓存已合并。最新上线状态及尚未达成的性能预算见 [上线闭环记录](../../audits/2026-11-07-launch-closeout/README.md)；仅事实页面验收不代表时钟上线，合并和本地测试也不代替生产登录态验证。

后续 #138 合并过期共享缓存的重建 promise，并让策略客户端／响应绕过浏览器 HTTP 缓存。#142–#153 全部已合并，代码基线为 `ab11d6e3b41a603169fda19df2db2d69fdad70c9`。#146 增加策略客户端鉴权切换隔离；#150 去掉持久化后的完整 manifest 回读；#143/#144/#149/#151–#153 包含测试或记录闭环，不能作为额外产品能力。逐 PR 范围及未完成任务见 [跨模块发布任务清单](../plans/2026-11-07-cross-module-integration.md#remaining-release-tasks)。

最新生产 `ab11d6e3` 已由 release-main 留存 READY 部署、精确 CI 与公开方法／判断及匿名鉴权核验；#146/#150 已部署，但没有新版本登录态或性能验收。生产证据与浏览器验收按精确部署 SHA 分别记录在 [发布记录](../../audits/2026-11-07-launch-closeout/README.md)。`98e9a819` 的中美登录态时钟、量化依据与真实来源抽屉核心流程是该旧部署的已验证结果；新合并代码、合成测试与匿名检查不能继承为新部署登录态验收。用户审美认可、完整生产移动端／退出登录／账号切换、原始文件下载及新性能样本仍需独立证据；#150 的模拟响应字节下降不证明生产延迟或 p95 达标。

上表审计栏保留设计阶段历史结论，不代表当前代码仍未实施。合并不等于生产启用；生产证据以部署记录和登录态验收为准。

实施顺序（总纲）：计划二 → 计划三 → F3 → F4 → F6 → 行业 → 公司 → 外资研报；宏观工作台在 F4 后对齐。

约定："已按 Codex 原方案实现，未复审"表示该稿把审计报告中带具体修法的条目逐字落实，但没有再跑一轮；写实施计划前各做一轮增量审计（提示词限定"新引入缺陷 + 终审结论"）。

追加（2026-11-07）：宏观工作台 P3+P4（传导、历史、复盘、解读）`2026-11-07-macro-workbench-p3-p4-design.md` 第 3 稿；Codex 第二轮 "not ready"，N1–N14 已按 Codex 原方案实现、未复审（两轮上限），审计 `docs/audits/2026-11-07-macro-p3-p4/`；计划 `2026-11-07-macro-workbench-p3-p4.md`；画布 https://claude.ai/artifact/2s8t4QpQGAGCXWZNfQ2TUW；依赖 P1+P2 与 F4（WP-S6 接线）。
