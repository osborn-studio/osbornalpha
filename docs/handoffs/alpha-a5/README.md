# WP-A5 handoff — dedupe clustering + entity alignment（2026-09-26）

范围：《实施总纲 2026-09-22》§5.1 cluster 字段回填、§5.5 实体对齐、§10.1 ② 类指标抽样。分支 `codex/wp-a5-cluster-align`，基于 `codex/wp-a6-controlled-copies`。

## 交付

- `src/lib/research/cluster/`：`normalize.ts`（canonical URL / 标题）、`minhash.ts`（字符 3-gram、128 hash）、`cluster.ts`（URL → 标题 → MinHash Jaccard ≥ 0.8，确定性 uuid v8 簇 id，`cluster_first` 改判）、`align.ts`（A2 别名扫描，0/1/≥2 候选 → 无/aligned/ambiguous）、`run.ts`（`runCluster` / `runAlign`，幂等，审计 `cluster.run` / `align.run`；`--since` 只限定待分簇的新行，已分簇行全量载入以保证 `cluster_first` 与跨窗口合并正确；对齐顺序：collector 提供的 `entity_ids` → aligned(collector) 记录并与 `entity_ids` 对账 → 仅对无 aligned 记录的 Source 跑文本规则）、`report.ts`（抽样、CSV、Wilson 95%）。
- 迁移 `20260926100000_research_source_entity_alignments.sql`：`(user_id, source_id, entity_id)` 主键，method/status/confidence 约束，owner RLS，复合外键到 Source 与实体。
- 脚本：`scripts/research-cluster.ts [--since] [--align] [--jaccard]`、`scripts/cluster-sample.ts --out x.csv [--n 100] [--seed 1]`、`scripts/cluster-report.ts labeled.csv`。

## 本地验收（不接触生产）

`acceptance-2026-09-26.json`：隔离 PostgreSQL 17（`scripts/s4/local-db.ts`）+ 本机 PostgREST 16.4 网关；一次性 owner uuid；21 家 A2 实体键；8 条合成 Source（无私有材料）。结果：

| 项 | 第一次运行 | 第二次运行（幂等） |
|---|---|---|
| cluster：scanned / fresh / written / clusters | 8 / 8 / 8 / 6 | 8 / 0 / 0 / 0 |
| align：aligned / ambiguous / rows / entity_ids merged | 4 / 1 / 6 / 4 | 0 / 0 / 0 / 0 |

- URL 级合并：`www.` + `utm_*` 与裸 URL 同簇；文本级合并：两条转载正文（Jaccard > 0.8）同簇；单候选 Source 写入 `aligned` 并合并进 `entity_ids`；双候选 Source 只写 `ambiguous`，不改 `entity_ids`。
- `sample-2026-09-26.csv`：8 行（人群只有 8 条），两列 `label_*` 留空待人工；`cluster-report.ts` 对未标注样本给出 0/0 与 [0%, 100%] 区间。

## Codex 评审（gpt-6-astra，medium）

1 P1 + 3 P2，已全部修复并各有回归测试：窗口运行改判 `cluster_first`（全量载入已分簇行）；aligned 记录存在但 `entity_ids` 未合并时的恢复（先对账再跳过）；collector 路径缺失（`method='collector'`）；别名只读 legacy 实体行（并入 A2 键与上市代码）。

## 已知限制（待 100 条人工标注后再调）

1. 标题级合并只剥离 `normalize.ts` 允许名单中的站名；未知站名后缀（如「| 财经网」）不合并，靠 URL 或正文规则兜底。
2. MinHash 用 3-gram **集合**，重复模板文本会抬高相似度：正文以站点样板为主时可能误并（首轮验收夹具曾因所有正文共用同一段落而误并，改为不同正文后消失）。
3. 别名来源为 legacy 实体行 + A2 `research_entity_keys` 名称/别名 + 全部上市代码；规则对齐只看别名字面命中，`MIN_ALIAS=3` 以下别名（「AI」「金」）忽略；Jev / 人工方法只有表结构，未接入。
4. `ingestSource` 按 content_hash 去重：正文完全相同的两条不会成为两条 Source，也不会进入簇统计。
