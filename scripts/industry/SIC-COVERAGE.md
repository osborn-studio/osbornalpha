# SIC 覆盖与 backlog 诊断（只读）

现有 `sync.ts --job memberships-sic` 默认只返回 `dry_run_unsupported`。本工具补充库存诊断；不执行同步、不请求 SEC、不加载应用环境文件。要求 Node 22 和显式指定的 PostgreSQL 连接，使用已有、可完整读取相关表的操作员身份；不创建身份、不授予权限。

```sh
# 连接由操作员通过自己的环境安全注入；不要把凭据写入命令历史或报告。
node --import tsx scripts/industry/sic-coverage.ts
```

必须设置 `SIC_COVERAGE_DATABASE_URL`。工具不读取默认 `DATABASE_URL`，不自动加载 `.env`。在一个 `REPEATABLE READ READ ONLY` 事务中读取固定 SQL，设置 15 秒语句超时和 2 秒锁超时。RLS 生效的连接会被拒绝，避免将不可见记录报告为零；缺表或权限不足也会失败。连接目标由操作员负责选择，本次开发仅验证独立本地库。

stdout 仅输出汇总 JSON，错误只返回固定消息。退出码 0 表示诊断读取完成（backlog 非零、无分类、internal/missing 授权均可返回 0），1 表示读取失败，2 表示环境/参数用法错误。没有 `--apply`、授权修改或 I-3 激活功能。

| 字段 | 口径 |
| --- | --- |
| `scope.usRows` / `eligibleIssuers` | US scope 行数 / US 且 priority > 0 的去重发行人数，与 `syncSicScope` 一致 |
| `missingIssuer` / `missingCik` / `invalidCik` | eligible scope 没有 issuer 记录 / 已有 issuer 但 CIK 空 / CIK 非 1–10 位非零数字；三个计数不重叠 |
| `classificationCodes` | SIC、sec-current、L1 的分类数；不代表公司已分类 |
| `memberships.currentRows` / `currentIssuers` | UTC 当日可见且有效的 ok SIC L1 membership 行数 / 去重发行人数；包含已不在 eligible scope 的成员 |
| `eligibleWithMembership` / `eligibleWithoutMembership` | eligible 发行人与当前 membership 的交集 / 差集；后者是覆盖 backlog，不是到期任务数 |
| `currentRowsWithoutClassification` | 当前 membership 找不到分类码；计入 currentRows，但单独提示完整性缺口 |
| `schedule` | 仅 eligible scope 的调度状态。missing 无调度行；retired 是退休哨兵；leased 是未过期 lease（等于观察时间仍占用）；dueUnleased 已到期且无 lease；futureUnleased 未到期且非退休。retired 与 leased 可重叠，不能直接相加。missing/retired 在下一次真实同步时可能由现有 scope reconciliation 修复 |
| `schedule.lastFailed` | 最近调度结果为 failed，可与上述状态重叠；不能等同于 SEC provider 失败 |
| `latestMembershipBatch` | 最近启动的 SIC membership 批次，可能仍 running。providerUnavailableEntries 只统计保存回执中的 sec_unavailable 条目；otherErrorEntries 不含 skipped_summary/truncated。errorsTruncated 为真表示错误被截断，条目数是下界，不是失败发行人总数。skippedSummaryPresent 不推断具体公司没有 SIC，也不输出 skip 原始消息 |
| `license` | 读取实际 SIC scheme 授权：public/internal/missing/unknown；public 只描述该授权行 |

本报告不查询财务事实、证据可发布性、SW 完整性或聚合 run，也不检查分类抓取批次；`financialFactsCoverage=not_measured`、`publicationReadiness=not_evaluated`、`i3=not_evaluated`。例如 300/801 个 eligible 发行人有 membership，不等于 300 家公司的财务数据可发布。无 membership 不能归因于 SEC 没返回 SIC：未尝试、无 CIK、404、空 SIC、未知分类码及失败均可能导致缺口；需要操作员结合现有批次/隔离记录继续调查。

独立本地测试（指定新建的空 disposable 数据库；测试创建固定 fixture 表，不能使用应用数据库）。保护条件要求 localhost/127.0.0.1、显式非 5432 端口、数据库名以 `sic_coverage_test` 开头；运行完成后由调用方清理自己的 scratch PostgreSQL 集群：

```sh
SIC_COVERAGE_TEST_DATABASE_URL=postgresql://localhost:55888/sic_coverage_test \
  node --import tsx --test scripts/industry/sic-coverage.test.ts
```

测试使用真实 PostgreSQL 验证汇总、历史/未来/隔离成员排除、重复成员去重、scope 外成员、lease/退休状态、回执截断及缺失错误码、RLS 拒绝、输出脱敏、只读写入拒绝、失败回滚和连接关闭异常脱敏。现有同步 batch limit 不变；该报告不建议提高 limit，也不改变任何门控。
