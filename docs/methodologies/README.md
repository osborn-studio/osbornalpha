# 方法文档模板（规格 §4.2）

每个方法版本一份文档：`docs/methodologies/<methodology_id>/<version>.md`（例：`docs/methodologies/macro_regime/v1.md`）。文档的 sha256 进 `formula_hash`（规格 §4.1）：改文档 = 改公式，必须升版本，否则 `scripts/judgments/sync-methodologies.ts` 报 `formula_hash_drift` 并拒绝同步。下面七个章节**固定、按序、不可省略**；不适用的章节写"不适用"并说明原因。

## 1 回答什么问题

一句话陈述判断回答的问题、判断类型（`judgment_type`）、种类（`kind`：probability / categorical / score / interval）与生产者（`producer_kind`：v1 公共表只收 `rule` / `model`）。

## 2 主体与输入

- 主体类型（`subject_types` ⊆ `issuer / industry / macro_region / macro_series`）与主体键格式。
- 每种输入（`input_kinds` ⊆ 公共白名单）：来源表 / 接口、构造器（`src/lib/judgments/inputs.ts`）、`available_at` 口径（规格 §3.7）、`origin` 行（`src/lib/judgments/origins.ts` 的 `kind×adapter` 键）；许可状态不写在方法文档或代码里，见 `docs/methodologies/licenses.json`（同键，只由同步脚本读取，决策 D3）。
- 绑定（`WorkItem.binding`）：生产者绑定的上游对象及其如何出现在输入引用里（规格 §6.4）。

## 3 公式与参数

公式全文（与实现逐项对应）；`params` 每个键的取值、单位与**来源**（规格条款、上游规格、政策常量——政策常量要写明"政策常量，非推导"）；`params_json` 的 JSON Schema（如有）；`upstream` 绑定的上游方法版本；`deps` 列出的非 import 依赖文件。

## 4 可证伪条件、目标期与标签政策

`condition`（resolver、params、predicate）与它的文字；`horizon`；`target` 的解析规则（规格 §3.4 默认实现或本方法的覆盖）；`label_policy`（`first_observed` / `cutoff_vintage`）及理由；`grace_days`（默认值与理由）；`window_years`（须 ≥ 期限对应自然日的 3 倍）。

## 5 结算 resolver 与实现值定义

resolver 名称与版本；实现值的唯一定义（自然键、单位、覆盖要求、缺失时的处理）；`labelAvailableAt` 的估计规则；会导致 `void` / `Inconsistent` 的情形。

## 6 不适用情形（何时 abstain）

逐条列出 `abstain_reason` 及触发条件（缺输入、上游版本不匹配、市场无 verified 复权能力、目标不可解析……）。

## 7 版本历史

| 版本 | 日期 | 改动 | `formula_hash` 前 12 位 |
|---|---|---|---|
| v1 | YYYY-MM-DD | 初版 | 由 sync 脚本输出填写 |
