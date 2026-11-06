# 01 — F6 评测与黄金集 实施记录

执行：Opus 5.5 指挥；每任务 Sonnet 5.5 实施子代理（TDD）→ Opus 规格复审 → Opus 质量复审 → Codex CLI gpt-6-astra（medium）`codex review --commit` + 对抗挑战 → 修复 P1/P2。
计划：`docs/superpowers/plans/2026-11-06-evals-and-gold-sets.md`；规格：`docs/superpowers/specs/2026-11-04-evals-and-gold-sets-design.md`（第 6 稿，§0 权威）。

| 序 | 任务 | 提交 | 规格复审 | 质量复审 | Codex review / 挑战 | 修复轮次 | 备注 |
|---|---|---|---|---|---|---|---|

## Task 10 — projections, ledger, replay kind

- Files: src/lib/evals/projections/facts.ts, src/lib/evals/replay/{fixture,ledger}.ts, src/lib/evals/kinds/replay.ts, src/lib/evals/test-support/memory-facts.ts (+ tests).
- Decisions: projections read history=true; diff notation facts[<concept>/<start>..<end>/<duration>/<unit>/<consolidation>/<available_date>/<source_ref>].<field>, null = empty segment, one-sided row = bare path; unprivileged ledger hit = explained_diff; ledger structural errors = gold_invalid.
- Not wired here: Task 7 factsReader.project → projectRequest (CCR 2).
