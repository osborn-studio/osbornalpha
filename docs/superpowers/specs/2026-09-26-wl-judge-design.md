# B3（Alpha 侧）：WL 判定脚本 judge-wl（设计）

日期：2026-09-26。来源：总纲 §6.1 WL 问题、WP-B3。Brain 侧 lint 与文件契约见 Osborn-brain `docs/superpowers/specs/2026-09-26-wiki-lint-design.md`、`config/wiki-wl-pairs.schema.json`、`config/wiki-wl-answers.schema.json`。分支 `codex/wp-b3-wl-judge`，基于 `main`。常设授权下按默认方案执行。

## 决定（默认）

1. Brain 不持 Jev 凭据。Brain lint 导出候选对文件（`brain-wiki-wl-pairs/1.0`），Alpha 脚本逐对问 Jev WL 问题，写回答案文件（`alpha-wiki-wl-answers/1.0`）。
2. WL 问题（Choice，`wl/1.0`）：选项 `contradicts`（矛盾）/`superseded`（被取代）/`consistent`（一致）/`unrelated`（无关）；state = 页面断言 + 已引用原文片段 + 新材料片段；每对一次 System One 请求，模型钉在 `jev-1.13.0`；`confidence < 0.6` → 弃权（由 Brain 决定不生成建议，脚本照录）。
3. 预算：`--max-cost-usd`（默认 1.0）；成本按 usage 计（无 usage 时用 `estimateTokens × 45 micros/1k`）；超预算停止，未判的对不写入答案（Brain 统计为未答）。
4. 幂等：`--out` 已存在时读取其中 `pair_id`，跳过已答；同一 `pairs_hash` 才追加，否则拒绝（`pairs_mismatch`）。
5. 公开性回查：每个 `candidate.source_id` 与 `cited_snippets[].source_id` 在库中必须存在且 `permission = 'public'`（service ctx，本地/开发库）；任何一条不满足 → 整份拒绝，不发任何请求。
6. 不写台账：WL 不绑定 thesis，`research_judgments` 的 scope 校验不适用；答案文件即记录。`TYPESAFE_API_KEY` 缺失 → 退出 1，不写文件。

## 交付

- `src/lib/research/wiki/wl.ts`：`WL_QUESTION`、`WL_QUESTION_VERSION`、`buildWlRequest(pair)`、`parseWlAnswer(raw)`、`judgeWlPairs({pairs, existing, fetch, apiKey, maxCostUsd, now})`（纯：返回 `answers`、`spent_micros`、`stopped`）、`pairsHash(doc)`。
- `scripts/wiki/judge-wl.ts --pairs <abs> --out <abs> [--max-cost-usd X] [--dry-run]`。
- 测试：请求构造、答案解析（分布/置信度/弃权）、预算停止、幂等跳过、`pairs_mismatch`、非 public 拒绝；假 fetch。
