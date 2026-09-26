# E3b 实施计划
> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.
1. vendor 0.3.0 + lockfile + `verify-engine.ts`（两套 golden、两个哈希）→ 提交
2. 发布政策 v2 文件、schema v2、attestations、golden v2 fixtures；`market-policy.ts` V2；proposal released；`market-pair.ts`；测试 → 提交
3. `decisions.ts` 2.0 注册；`s6/market.ts` `freezeMarketHandoff`；`s6/store.ts` 版本门；`fixtures.ts` 生成器；真库集成测试 → 提交
4. 操作员脚本；S7 manifest 重生成与 verify 更新；文档（POLICY-NEXT、alpha-s6 README、alpha-e3b README）→ 提交
5. 全量验证、Codex、PR、bind + Auto-fix
