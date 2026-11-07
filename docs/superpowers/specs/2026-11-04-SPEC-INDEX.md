# 研究重建规格总览（2026-11-04）

总纲：`docs/research/chaosai-integration-2026-11-04/EXPERT_PLAYBOOK_AND_BRIEF.md` §5。所有规格设计在 Fable 5.1 上完成，每份都经 Codex CLI（gpt-6-astra，medium）多轮对抗审计，报告与处置表在 `docs/audits/2026-11-04-<slug>/`。实施阶段：代码由 Opus 5.5 子代理按计划逐任务完成，每个任务再经 Codex 审计。页面类规格的 GUI 与 UI flow 按 owner 规则先在 Claude Design 画布上设计（各规格末尾的"待设计清单"）。

| 规格 | 文件 | 稿次 | Codex 终审 | 审计目录 | 当前实施状态 / 下一步（2026-11-07） |
|---|---|---|---|---|---|
| 数据底座一（F1 发行人 + F5 质量设施） | `2026-11-04-data-foundation-design.md` | 已实施（§14 偏差） | 任务级审计 | — | PR #100 已合并 |
| 数据底座二（F2 披露事实库） | `2026-11-04-data-foundation-2-disclosure-facts-design.md` | 8 | 第八轮："ready for an implementation plan with owner decisions A/B/C pending" | `2026-11-04-data-foundation-2/`（01–15 + README） | PR #102、#104 已合并；生产记录见 #113 |
| 数据底座三（F1b 标识符 + F5 对账与日历新鲜度） | `2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md` | 6 | 第五轮（增量 + 落地代码核对）T1–T15、第六轮确认 U1–U3 均按规定修法落实 | `2026-11-04-data-foundation-3/`（01–07 + 03 处置） | PR #108 已合并；后续数据覆盖与人工核对见运行手册 |
| F3 披露文档管道 | `2026-11-04-document-pipeline-design.md` | 6 | 第五轮（增量 + 落地代码核对）"not ready"；R5-1–13 已按原方案实现 | `2026-11-04-document-pipeline/` | PR #114 已合并；公司来源抽屉集成 #118、RPC 迁移锁定 #126 |
| F4 判断层框架 | `2026-11-04-judgment-framework-design.md` | 5 | 第四轮 "not ready"；R01–R06 已按原方案实现，未复审 | `2026-11-04-judgment-framework/` | PR #117 已合并；宏观 v2 修复 #129、#132，许可 #131；生产注册与开关另行验收 |
| F6 评测与黄金集 | `2026-11-04-evals-and-gold-sets-design.md` | 6 | 第 6 稿已按计划 `2026-11-06-evals-and-gold-sets.md` 实施，见 §18.1 | `2026-11-04-evals-gold-sets/` | PR #106、#127、#137 已合并；#137 修页码／bbox 校验并提供可用性诊断；extraction_gold / judgment_calibration 仍禁用，未取得许可或新增概率方法 |
| 行业研究 | `2026-11-04-industry-research-design.md` | 5 | 第四轮 "not ready"；U1–U6 已按原方案实现，未复审 | `2026-11-04-industry-research/` | PR #107、#123、#141 已合并；#141 仅离线对账诊断与 H 决策计划，不是 I-3 估值流水线；估值、PB／公式决策、授权和行业判断仍待闭环 |
| 公司研究与跟踪 | `2026-11-04-company-research-design.md` | 5 | 第四轮 "not ready"；#40/#57–#60 已按原方案实现，未复审 | `2026-11-04-company-research/` | PR #115、#118、#124、#140 已合并；#140 修回放读取实时收件箱；来源抽屉默认开，公司判断默认关；CN PDF 定位、issuer 方法与独立黄金集未因此完成 |
| 外资研报 | `2026-11-04-foreign-research-design.md` | 4 | 第四轮 "READY WITH P2 FIXES"；三条 P2 已实现 | `2026-11-04-foreign-research/` | 依赖 F3/F4；owner 决策 D1–D7；画布 |
| 宏观工作台（P1+P2） | `2026-11-04-macro-workbench-design.md` | 2 | 2026-11-06 增量轮 "not ready"（M1–M26 全部接受并落实） | `2026-11-06-macro-workbench/` | PR #109 已合并；P3/P4 经 #111、#112 接入；#119 生产事实验证，#128 性能优化，#130 入口改为 /macro |

美林时钟发布增量：#133 JSONB 查询修复、#134 manifest、#135 四象限与证据约束、#136 跨实例纯事实缓存已合并。最新上线状态及尚未达成的性能预算见 [上线闭环记录](../../audits/2026-11-07-launch-closeout/README.md)；仅事实页面验收不代表时钟上线，合并和本地测试也不代替生产登录态验证。

后续 #138 合并过期共享缓存的重建 promise，并让策略客户端／响应绕过浏览器 HTTP 缓存以重新检查鉴权、修订和判断。#137–#141 已合并至 `dc47ba2e`；各模块交付边界以上表为准，不能把诊断、修复或合并等同于整模块完成。新 widget #142 已随 `98e9a819` 上线，中美登录态时钟、量化依据与真实来源抽屉核心流程通过；同一生产提交包含 #144/#145/#148。详见 [发布证据](../../audits/2026-11-07-launch-closeout/README.md)。用户审美认可、完整生产移动端／退出登录验证与新性能样本仍未完成，#150 优化未发布，F6 禁用项未启用。

上表审计栏保留设计阶段历史结论，不代表当前代码仍未实施。合并不等于生产启用；生产证据以部署记录和登录态验收为准。

实施顺序（总纲）：计划二 → 计划三 → F3 → F4 → F6 → 行业 → 公司 → 外资研报；宏观工作台在 F4 后对齐。

约定："已按 Codex 原方案实现，未复审"表示该稿把审计报告中带具体修法的条目逐字落实，但没有再跑一轮；写实施计划前各做一轮增量审计（提示词限定"新引入缺陷 + 终审结论"）。

追加（2026-11-07）：宏观工作台 P3+P4（传导、历史、复盘、解读）`2026-11-07-macro-workbench-p3-p4-design.md` 第 3 稿；Codex 第二轮 "not ready"，N1–N14 已按 Codex 原方案实现、未复审（两轮上限），审计 `docs/audits/2026-11-07-macro-p3-p4/`；计划 `2026-11-07-macro-workbench-p3-p4.md`；画布 https://claude.ai/artifact/2s8t4QpQGAGCXWZNfQ2TUW；依赖 P1+P2 与 F4（WP-S6 接线）。
