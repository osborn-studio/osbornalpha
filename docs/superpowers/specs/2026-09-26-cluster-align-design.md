# 去重聚簇与实体对齐设计（WP-A5） / Clustering and entity alignment design

日期：2026-09-26。来源：《实施总纲 2026-09-22》§5.1（cluster 字段）、§5.2、§6.1 EA、§8.2 WP-A5。分支叠在 A6（含受控副本进 fan-out）之上；依赖 A1（列）、A2（别名表）、A3（无直接写入，Q5 通过 cluster_id 生效）。用户已确认设计；Jev EA 只留接口。

## 目标 / Goal

为 `research_source_documents` 回填 `cluster_id`/`cluster_first`（近似重复簇，规范 URL → 标题归一 → 字 3-gram MinHash），并把 Source 与 A2 实体对齐（别名规则为基线，多候选进人工队列），结果落 `research_source_entity_alignments` 并回填 `entity_ids`。输出 100 条人工抽样与簇/对齐正确率报表脚本。

## 非目标 / Non-goals

- 不实现 Jev EA 调用（接口 `EntityAligner` 预留，`jev` 方法值保留）；不做 passim 片段对齐。
- 不改 A6/A3 语义：A6 已按 `cluster_id`/`cluster_first` 决定是否问 Q5；本包只让这两列有值。
- 不接触生产库。

## 聚簇规则（`src/lib/research/cluster/`）

1. `normalizeUrl(url)`：小写 scheme/host、去 `www.`、去 fragment、去追踪参数（`utm_*`、`fbclid`、`gclid`、`spm`、`from`、`share_*`、`ref`），参数按名排序，去尾部 `/`，`http`→`https`。无 URL → null。
2. `normalizeTitle(title)`：NFKC、小写、去括注 `【】[]（）()` 内的媒体名后缀、去标点与空白、去常见站名后缀（`_新浪财经`、` - 东方财富` 等以分隔符 `_ - | –` 切出的最后一段若 ≤8 字且匹配已知站名表）。空 → null。
3. `minhash(text)`：字 3-gram（NFKC 小写、去空白）→ 128 个 32 位哈希（xxhash 风格双哈希 `h1 + i*h2`）；`jaccard(a,b)` = 相等位比例。正文取前 20,000 字符。
4. `assignClusters(sources, existing)`（纯函数，输入按 `available_at, id` 升序）：对每条 Source 依次找 (a) 同 `normalizeUrl` 的簇，(b) 同 `normalizeTitle` 的簇，(c) 与任一簇代表（簇内最早）的 MinHash Jaccard ≥ `CLUSTER_JACCARD` （默认 0.8）；命中则加入，否则新簇（`cluster_id = uuid`，由 owner + 第一条 source_id 派生的 uuid v8，确定性）。`cluster_first` = 簇内 `available_at` 最早（并列取 id 小）。已有 `cluster_id` 的行作为既有簇载入，不重新分配；若新行更早，则原 first 的 `cluster_first` 变 false（写回）。
5. 私有 Source 与受控副本参与聚簇（聚簇是本地计算，不外发），但簇代表比较只读文本，不改任何内容。

## 实体对齐（`src/lib/research/cluster/align.ts`）

- 候选：A2 `listEntityKeys`（names_zh/names_en/aliases + 交易所代码）加 `research_entities.name/aliases`；别名 ≥2 字（CJK）或 ≥3 字符（Latin，词边界）才参与；在 `title + raw_text[:20000]` 中匹配；每实体记命中次数与首个位置。
- 决策（rule）：0 候选 → 不写；1 候选 → `aligned`（confidence = min(1, 0.6 + 0.1·hits)）；≥2 候选 → 全部 `ambiguous` 进人工队列（`status='ambiguous'`）。已有 `entity_ids` 的 Source（采集器已知实体）→ 对应实体记 `aligned`，`method='collector'`，不改 `entity_ids`。
- 写入：`research_source_entity_alignments(user_id, source_id, entity_id, method rule|collector|jev|human, status aligned|ambiguous|rejected, confidence, evidence jsonb{alias, hits, position}, decided_at, decided_by)`，主键 `(user_id, source_id, entity_id)`；`aligned` 时把 entity_id 并入 `source.entity_ids`（去重，不删已有）。人工裁决走同表 upsert（`method='human'`），并同步 `entity_ids`（rejected → 移除）。
- `EntityAligner` 接口：`(input:{source, candidates}) => Promise<AlignmentDecision[]>`；提供 `ruleAligner`；`jev` 只在类型枚举中保留。

## 运行与脚本

- `runCluster(ctx, {since?, limit?})`：分页读 `cluster_id is null` 的 Source（以及窗口内已有簇作为载入），`assignClusters` 后批量 `update`（每行 `cluster_id`、`cluster_first`），审计 `cluster.run`；幂等（再次运行无变化）。
- `runAlign(ctx, {since?})`：对窗口内无 `aligned` 记录的 Source 跑规则对齐；审计 `align.run`。
- `scripts/research-cluster.ts [--since ISO] [--align]`；`scripts/cluster-sample.ts --out sample.csv [--n 100]`：随机 100 条（簇大小 ≥2 优先一半）导出 `source_id,title,url,cluster_id,cluster_first,cluster_size,cluster_peer_title,aligned_entities,ambiguous_candidates,label_cluster_correct,label_alignment_correct`（后两列留空给人工）；`scripts/cluster-report.ts sample-labeled.csv` → 簇正确率、对齐正确率、样本量、置信区间（Wilson 95%）。

## 测试

- `normalize.test.ts`、`minhash.test.ts`（近似重复 Jaccard 高、无关文本低、确定性）、`cluster.test.ts`（URL/标题/MinHash 三级合并、first 改判、确定性 uuid、既有簇不重分）、`align.test.ts`（候选提取边界、单/多候选决策、collector 方法）、`run.test.ts`（mock ctx：写回、幂等、entity_ids 合并）、`alignments.integration.test.ts`（迁移可重放、RLS、主键、status/method 约束）、`report.test.ts`（指标与 Wilson 区间）。

## 验收

`npm test`、typecheck、lint、build；Codex（中等）无 P1；对本地库跑一次 `research-cluster.ts --align` 并生成 100 条抽样 CSV（标注为空，待人工）。
