H1 已完成：固定双语观察模板、逐句证据抽屉、版本页脚和 history 路由修正均已接入。

文件变更：
- `src/components/macro/strategy/`：新增 `cycle-notes.ts`、`CycleNotes.tsx`、`cycle-notes.test.ts`；修改 `StrategyScreens.tsx`
- `messages/{zh,en}/macroStrategy.json`：新增 `cycleNotes` namespace

测试结果：
- typecheck、lint、diff 检查通过
- 专用测试：14/14 通过
- 指定范围单 worker 重跑：1554 通过、86 跳过；仅允许忽略的 `replay.test.ts` 一项超时

未完成：真实浏览器验证被沙箱权限阻止，组件交互测试通过。未提交、stash 或切换分支；原有审计文件保留。