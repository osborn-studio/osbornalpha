# T22 runbook, spec §19, macro norm tolerance — mmx (MiniMax-M3) audit

Commits: cfb4ee2f; input 48477 chars (scratch copy not committed)

## 审计发现

| ID | P1/P2/P3 | file:line | defect | concrete counterexample | fix |
|---|---|---|---|---|---|
| JJ-T22-01 | P1 | `src/lib/judgments/methodologies/macro-regime.v1.ts:58` | 将宏观 norm 总和容差从 `1e-9` 放宽到 `5e-6`，但未同步到分类器实际使用的 `norm` 值；这会让一个六位小数、总和偏离 1 达 `5e-6` 的快照被接受，同时分类结果仍基于未归一化的概率。该容差还大于测试所称的“六位舍入误差”通常规模，缺乏与输入生产端舍入规则的闭环。 | `recovery=.325000, overheat=.225000, stagflation=.225000, recession=.225001` 的总和为 `1.000001`，会通过当前 `5e-6` 检查；更直接地，任何总和恰为 `1.000005` 的快照也会通过，而规范只允许六位小数分类结果产生有限舍入误差。该输入会被登记为有效宏观判断，而不是 `invalid_snapshot`。 | 不要无条件放宽输入校验。应在分类器生成/读取 `norm` 时完成一次显式归一化，或将容差绑定到可验证的分类器版本及舍入契约；新增“刚好在边界接受/拒绝”的测试，并确认 `norm`、primary/secondary state 与归一化后的值一致。 |
| JJ-T22-02 | P1 | `docs/superpowers/specs/2026-11-04-judgment-framework-design.md:1004-1007` | §19 将未运行的 PostgreSQL 门禁记为“commander 验证”，但同一提交明确记录 `test:db` / `test:migrations` 未运行且数据库 runner 不可用。该表述把未完成的验证伪装成已完成，直接违反任务要求的“全量门禁绿”。 | 运行 `npm run test:db` 或 `npm run test:migrations` 目前没有结果；实现记录 §Task 22 明确写着“本任务按指挥要求未运行”。因此提交不能支持“数据库测试已通过”或“可合并”的结论。 | 将门禁表改为明确的 `未运行 / blocked`，注明环境原因、命令和责任方；只有实际执行并保存成功结果后才能写“通过”。在数据库门禁未通过前不得将 T22/F4 标记为完成。 |
| JJ-T22-03 | P2 | `src/lib/judgments/rpc-inventory.test.ts:5-21` | 回滚清单测试只检查函数名是否出现，不检查其出现在正确的回滚段落中，也不检查 §8 的 `Object.keys(F4_FUNCTIONS)` 是否覆盖 inventory 中全部函数。测试可以在 §8 只写一个无关函数名时通过。 | 将 `F4_FUNCTIONS` 中某个函数从 §8 删除，同时在 §8 的说明文字中保留一次该函数名，`mentions(section(8), n)` 仍返回 `true`；或把函数名误放到 §1，测试仍会通过。 | 对 §8 建立按函数名的完整清单/集合断言，而不是正则“出现”断言；解析回滚段落中的代码清单并与 `Object.keys(F4_FUNCTIONS)` 做双向集合比较。§1 也应验证每个函数只出现在正确分组。 |
| JJ-T22-04 | P2 | `docs/runbooks/judgments.md:47-51` | 运行手册没有给出 §5 迁移锁规则要求的最终锁定文件和 SHA-256 记录的可操作步骤。规格 §19 与 runbook 只要求合并者“计算并追加”，但没有提供实际命令、目标 JSON 结构、重复执行检测或如何确认锁文件已包含当前 SQL。 | 合并者执行 `shasum -a 256 ...` 后得到 SHA，却没有按仓库既有 `supabase/migrations.lock.json` 格式追加 `{file, sha256}`；部署可能使用未锁定或错误版本的迁移。 | 在 runbook 中给出与仓库现有 lock schema 完全一致的示例 JSON、实际 `shasum`/`sha256sum` 命令、追加/校验脚本，并规定锁定后任何 SQL 改动必须新建迁移。 |

### 结论

**Verdict: FAIL — 至少两项 P1：宏观 norm 校验放宽缺乏安全闭环，且 §19 将未执行的 PostgreSQL 门禁记作已验证。**
