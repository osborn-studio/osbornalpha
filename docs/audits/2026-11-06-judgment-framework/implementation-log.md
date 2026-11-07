# F4 实施记录

| 任务 | 提交 | Opus 复审 | Codex | 修复轮次 | 备注 |
|---|---|---|---|---|---|
| T5 batches deferred | 6cbfdb7c | 指挥直审 diff：符合 §7.5 | codex review：No actionable defects | 0 | 早于计划定稿执行（任务独立、稳定） |
| T1 core pure modules | cfc07e82 + FIXSHA | Opus: SPEC PASS (code), QUALITY PASS (minors fixed) | Codex review: 1 P2 (jsonClean __proto__) fixed | 1 | executed on plan draft 3 |

## 偏差 · Task 1

- `uuidV8` 放在 `src/lib/judgments/uuid-v8.ts`，而非规格 §2.4 的 `pa-v1/uuid-v8.ts`（计划审计 P2-03）。
- 格式错误的主体键用 `subject_missing`（消息 `invalid_subject_key:<type>`），规格 §13 无专门码。
- claim 校验拒绝未知成员。
- `score.dims` 覆盖与值一致（缺维度即 null）、`interval.scenarios` 概率和为 1（容差 1e-9）。
- `jobKey` 的 `scope_type='all'` ⇔ `scope_key=''`。
- 错误码表在规格 §13 之外新增若干码（`methodology_mismatch`、`settle_window_mismatch`、`duplicate_key`、`item_not_open`、`unknown`、`input_unavailable`、`snapshot_unclassified`、`binding_not_referenced`、`override_mismatch` 等）。
- 新增 `jobKey('calibrate_round')`（校准 cron 轮次游标，计划审计 P2-02）。
- `period` 目标的 `settle_after` = 下月 1 日 00:00Z（计划契约补充），规格写的是"该月末"。
- 共享契约按计划审计第一、二轮修订：`QuarantineOverride.cutoff`、`quarantineSettlement`、`rejectQuarantinedSettlement`、`envelopeById`、校准冻结 / 成员 / 清理（`freezeCalibrationCohort`、`cohortMembers`、`clearCalibrationGeneration`）。
- 审查修复：`jsonClean` 保留自有 `__proto__`；`parseJobKey` 严格（与 `jobKey` 往返一致）；`isRetrospective` 校验输入；摘要测试补 `kind` 单变量用例。
- 注：计划第三轮修复可能在队列 `last_detail` 增加 `incident` 子对象约定，不涉及 `types.ts`。
