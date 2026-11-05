# 研究重建规格总览（2026-11-04）

总纲：`docs/research/chaosai-integration-2026-11-04/EXPERT_PLAYBOOK_AND_BRIEF.md` §5。所有规格设计在 Fable 5.1 上完成，每份都经 Codex CLI（gpt-6-astra，medium）多轮对抗审计，报告与处置表在 `docs/audits/2026-11-04-<slug>/`。实施阶段：代码由 Opus 5.5 子代理按计划逐任务完成，每个任务再经 Codex 审计。页面类规格的 GUI 与 UI flow 按 owner 规则先在 Claude Design 画布上设计（各规格末尾的"待设计清单"）。

| 规格 | 文件 | 稿次 | Codex 终审 | 审计目录 | 状态 / 下一步 |
|---|---|---|---|---|---|
| 数据底座一（F1 发行人 + F5 质量设施） | `2026-11-04-data-foundation-design.md` | 已实施（§14 偏差） | 任务级审计 | — | PR #100 待合并 |
| 数据底座二（F2 披露事实库） | `2026-11-04-data-foundation-2-disclosure-facts-design.md` | 8 | 第八轮："ready for an implementation plan with owner decisions A/B/C pending" | `2026-11-04-data-foundation-2/`（01–15 + README） | owner 决策 A/B/C → 写计划二 |
| 数据底座三（F1b 标识符 + F5 对账与日历新鲜度） | `2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md` | 5 | 第四轮 "not ready"；S1–S7 已按 Codex 原方案实现，未复审 | `2026-11-04-data-foundation-3/` | 计划前再做一轮 Codex；依赖计划二落地 |
| F3 披露文档管道 | `2026-11-04-document-pipeline-design.md` | 5 | 第四轮 "not ready"；R4-1–7 已按原方案实现，未复审 | `2026-11-04-document-pipeline/` | 同上；owner 决策 A–G |
| F4 判断层框架 | `2026-11-04-judgment-framework-design.md` | 5 | 第四轮 "not ready"；R01–R06 已按原方案实现，未复审 | `2026-11-04-judgment-framework/` | 同上；owner 决策 O1–O7 |
| F6 评测与黄金集 | `2026-11-04-evals-and-gold-sets-design.md` | 5 | 第四轮 "not ready"（仅两条 P2）；已按原方案实现，未复审 | `2026-11-04-evals-gold-sets/` | owner 决策 D1–D8 |
| 行业研究 | `2026-11-04-industry-research-design.md` | 5 | 第四轮 "not ready"；U1–U6 已按原方案实现，未复审 | `2026-11-04-industry-research/` | 依赖 F2/F4；owner 决策 A–G；Claude Design 画布 |
| 公司研究与跟踪 | `2026-11-04-company-research-design.md` | 5 | 第四轮 "not ready"；#40/#57–#60 已按原方案实现，未复审 | `2026-11-04-company-research/` | 依赖 F2/F3/F4；§10.1/§10.2 对计划二/三的接口请求待接受；owner 决策 A–K；画布 |
| 外资研报 | `2026-11-04-foreign-research-design.md` | 4 | 第四轮 "READY WITH P2 FIXES"；三条 P2 已实现 | `2026-11-04-foreign-research/` | 依赖 F3/F4；owner 决策 D1–D7；画布 |
| 宏观工作台（P1+P2） | `2026-11-04-macro-workbench-design.md` | 1 | 早先通过 | — | 等 F4 落地后对齐判断契约 |

实施顺序（总纲）：计划二 → 计划三 → F3 → F4 → F6 → 行业 → 公司 → 外资研报；宏观工作台在 F4 后对齐。

约定："已按 Codex 原方案实现，未复审"表示该稿把审计报告中带具体修法的条目逐字落实，但没有再跑一轮；写实施计划前各做一轮增量审计（提示词限定"新引入缺陷 + 终审结论"）。
