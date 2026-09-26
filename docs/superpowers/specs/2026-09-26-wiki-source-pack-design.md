# B2（Alpha 侧）：Wiki Source 包导出（设计）

日期：2026-09-26。来源：总纲 WP-B2（依赖 A1、A2）。Brain 侧生成器与包契约见 Osborn-brain `docs/superpowers/specs/2026-09-26-wiki-page-generator-design.md` 与 `config/alpha-wiki-source-pack.schema.json`。分支 `codex/wp-b2-wiki-source-pack`，基于 `main`。常设授权下按默认方案执行。

## 决定（默认）

1. Brain 不连 Alpha 数据库。Alpha 用一个脚本把**公开** Source 与在范围公司导出为一个 JSON 文件（`alpha-wiki-source-pack/1.0`），Brain 只读这个文件。
2. 进包条件（全部满足）：`permission = 'public'`；不是 S4 受控副本（`metadata.s4_controlled_copy !== true`）；`source_type` 不是 NOTE/MANUAL；`origin_type` 不是 `private_observation`/`s4_controlled_copy`；`entity_ids` 与 `in_scope` 公司有交集。`entity_ids` 只保留在范围公司。`private`/`licensed` 一律不进包。
3. `content_hash` 按 `sha256(raw_text)` 复核，不符的行跳过并计数（不阻断）。
4. 排序确定：公司按 `entity_id`，Source 按 `available_at, id`。`pack_hash` = 规范 JSON（键递归排序、无空白、字符串按 `JSON.stringify`、顶层去掉 `pack_hash`）的 sha256；Brain 用同一定义复算。两仓各有一条金样测试固定同一个哈希值。
5. 公司字段：`entity_id`、`names_en/zh`、`aliases`、`home_market`、`lei`（A2 键）、`tickers`（现行证券 `exchange_code`，主证券在前）、`cohort`。`entity_table_version` = A2 `versionInput`。
6. 脚本只在本地/开发库运行（service ctx + `RESEARCH_OWNER_USER_ID`），输出文件路径由 `--out` 指定；stdout 只打印统计，不打印正文。

## 交付

- `src/lib/research/wiki/source-pack.ts`：`canonicalJson`、`computePackHash`、`packFromRows({entityKeys, sources, generated_at, producer_commit})`（纯）、`buildWikiSourcePack(ctx, {producerCommit, now})`。
- `scripts/wiki/export-source-pack.ts --out <abs.json>`。
- 测试：过滤规则、`entity_ids` 裁剪、排序、`pack_hash` 稳定与金样、mock ctx 端到端。
