# C1：校准重拟报告（设计）

日期：2026-09-26。来源：总纲 §6.2 末段「冻结集标注完成后：按问题分别拟合 isotonic，重设 §6.1 阈值；每季度用新增标签重拟；ECE 与准确率写入台账元数据」、§10.1 类①、§10.2、§10.3、§9 阶段 2「校准重拟」。分支 `codex/wp-c1-calibration`，基于 `main`。常设授权下按默认方案执行。

## 决定（默认）

1. 一个纯函数模块 + 一个只读脚本，不加表、不改阈值常量。脚本输出 JSON 工件与 Markdown 报告；`ECE 与准确率写入台账元数据` 落为工件文件（`docs/calibration/<date>.json`，由操作员提交入库），不做 DDL。
2. 输入：现有 `loadReportRows`（`research_judgments ⟕ 最新 research_labels`）。只用有标签的行做准确率/召回/ECE；弃权率、时延、成本用全部行。
3. 指标（每后端）：
   - `important_recall`（Q1）：标签为 `true` 的材料中后端判 `true`（未弃权）的比例；弃权计为漏。Wilson 95% 区间。
   - `false_support_rate`（Q2）：后端选 `support` 且标签 ≠ `support` 的数量 / 标签存在且未弃权的 Q2 判断数。Wilson 区间。
   - 每问 `accuracy`、`abstain_rate`、`ece_before`、`ece_after`（isotonic），p50/p95、每千判断成本（沿用 `summarize`）。
   - `ece_after` 用 5 折交叉拟合（按行序确定性分折）避免同样本乐观；标签 < 30 条的问题不报 `ece_after`。
4. isotonic：PAV（pool adjacent violators）逐问拟合 `score → P(正确)`；noul 用 `P(true)` 对 `label==='true'`，choice 用 confidence 对 `selected===label`。拟合结果输出为分段表（`[x_min, x_max, p]`）。
5. 阈值重拟（每问，标签 ≥ 30 才提议，否则 `insufficient_labels`）：
   - Q1：网格搜索 `(irrelevant_below, relevant_above)`，约束「重要材料召回 ≥ 0.90 且弃权 ≤ 30%」（§10.2），在可行解中取 `true` 精确率最高者；不可行则给出最接近解并标 `infeasible`。
   - Q2：网格搜索 `min_confidence`，约束 false-support ≤ 5%，取覆盖率（1 − 弃权）最高者。
   - Q3/Q4：`min_confidence` 网格，约束弃权 ≤ 30%，取准确率最高。
   - Q5：`retelling_below` 网格，取准确率最高。
   - 输出与当前 `THRESHOLDS` 并列，附 n 与区间；应用阈值 = 人工修改 `questions.ts` 并提交（问题集版本化，§6.2）。
   - 门槛联动：Q2/Q4/Q5 是论点门控问题，行上带同一快照 Q1 的 `gate_open` 与 `gate_p_true`；提议时先定 Q1，再以「Q1 P(true) > 提议的 relevant_above」重新判定每行门是否开启，关闭的行计为不可避免的弃权（指标含 `gated_by_proposed_q1`）。因此各问提议描述的是同一套运行时，须一起应用。
6. 停止/换后端规则（§10.3）按后端逐条给结论 + 证据：召回 < 0.85 或 false-support > 8% → `jev_q3q4_only`；rule 或 DeepSeek 与 jev 准确率差 ≤ 3 pt 且弃权更少 → `do_not_introduce_jev`；标签 ≥ 300 且 local_probe ≥ jev − 2 pt → `switch_local_probe`；提供 `--baseline` 上次工件时，任一问准确率变动 > 5 pt → `lock_version_recalibrate`。样本不足（标签 < 30）→ `insufficient_evidence`，不下结论。
7. 每季度重跑同一脚本即「重拟」；工件含 `question_set_version`、`generated_at`、`since`、行数与标签数。
8. 分区：只校准当前 `QUESTION_SET_VERSION` 的判断，且每后端只取最近出现的 `backend_model`（台账按 created_at 排序）；其余版本/模型的行数记入工件 `excluded` 并在报告开头列出，不与当前分类器混算，基线比较因此只比较同一版本：`--baseline` 的 `question_set_version` 与当前不同时，`lock_version_recalibrate` 记为 `not_applicable` 并注明版本。

## 交付

- `src/lib/research/fanout/calibration.ts`：`isotonicFit`、`applyIsotonic`、`crossFittedEce`、`wilson`、`classMetrics(rows)`、`proposeThresholds(rows)`、`evaluateStopRules(metrics, baseline?)`、`buildCalibrationArtifact({rows, since, generatedAt, baseline?})`、`renderCalibrationMarkdown(artifact)`。
- `scripts/calibration-report.ts [--since ISO] [--baseline /abs/prev.json] --out /abs/dir`：写 `<date>.json` 与 `<date>.md`；stdout 只打印计数与结论。
- 测试：PAV 正确性（单调、池化）、交叉拟合 ECE 下降于校准良好样本、召回/false-support 与区间、阈值搜索可行/不可行两支、停止规则各分支、基线比较、工件形状；全部合成数据。

## 非目标

- 不改 `THRESHOLDS`、不改 fan-out 运行时；不写数据库；不调用任何模型。
- EA 对齐准确率（§10.2）属于 A5 对齐表，本工具只在 `question_id = 'EA'` 的判断存在时按普通 choice 报准确率。
