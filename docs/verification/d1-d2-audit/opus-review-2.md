# D1/D2 第二轮复审结论

**结论：** 只发现 1 项需要在合并前处理的代码问题，即迁移演练中有一条 ACL 断言实际不起作用。另有 1 项合并门槛，不是代码缺陷，是证据缺口。首轮 6 项的修复我逐一看过，没有发现回退。

---

## 阻断项 1：`watchlist_alert_events` 的 UPDATE 撤权断言在本地引导下不起作用

**位置**
- `scripts/ci/migration-rehearsal.ts` 中的 `acl.update_allowed`
- `scripts/s4/local-db.ts` 中的 bootstrap

**原因**
- 本地 bootstrap 只创建了 `anon`、`authenticated`、`service_role` 三个角色。
- 它没有模拟 Supabase 的默认授权，即 `alter default privileges ... grant all on tables to anon, authenticated, service_role`。
- 表的 `UPDATE` 权限与函数不同，PUBLIC 默认不持有。因此在本地，`has_table_privilege('authenticated', 'public.watchlist_alert_events', 'UPDATE')` 恒为 false。

**触发方式**
- 删掉恢复 SQL 里的 `revoke update on table public.watchlist_alert_events from anon, authenticated;`，这条断言照样通过。
- 也就是说，`acl: "passed"` 和文档中"verifies ... selected ACL grants/revokes"的说法，至少在 revoke 这一侧没有被验证。这属于 CI 假绿。
- 其余三项检查是有效的，因为函数的 EXECUTE 默认授予 PUBLIC：
  - `claim_allowed`
  - `anon_allowed`
  - `owner_allowed`

**修法（二选一，范围都很小，不涉及业务权限改造）**

1. **推荐：只在演练中加入默认授权，再加一条前置断言防止再次空转。**
   - 给 `startLocalDatabase` 增加一个 rehearsal 专用选项，比如 `supabaseDefaultPrivileges: true`。在应用迁移前执行：
     ```sql
     grant usage on schema public to anon, authenticated, service_role;
     alter default privileges for role s4_admin in schema public
       grant all on tables to anon, authenticated, service_role;
     ```
   - 两个演练集群都传这个选项，保证 schema 对比仍然对称。
   - `test:db` 不传，这样不会改变现有 RLS suite 的语义。
   - 增加一条非空断言：`has_table_privilege('authenticated','public.watchlist_alerts','UPDATE')` 必须为 true。它证明默认授权确实生效，从而说明 `watchlist_alert_events` 的 false 来自 revoke 本身。
2. **或者删掉这条断言，同时修正文档和报告的措辞**，明确说明本地不验证表级 revoke。

---

## 合并门槛（非代码缺陷）：Linux CI 尚未实际跑通

目前的证据来自 macOS Homebrew 上的 PG 17.10。下面这些 Ubuntu 路径都没有被观察到实际运行：

- apt 安装 PG17
- `create_main_cluster=false` 的效果
- `pg_lsclusters` 检查
- 环境变量过滤与 runner 环境之间是否冲突

文档已经承认这一点。按本批"CI 同样跑全套"的目标，需要至少一次 GitHub Actions 运行全绿，并且上传的两个 summary 显示：

- `postgresVersion` 含 `Ubuntu`/`pgdg` 和 17.x
- `criticalSuites: 12`

这次运行完成前不应合并。

---

## 已复核、不构成阻断的点（不需要为本批修改）

- **清理路径。** 以下情况都能正确清理，并且保留原始错误：
  - `pg_ctl start` 超时，但 pid 文件存在
  - 第二个集群启动失败
  - fast stop 失败后改用 immediate stop
  - 集群已经停止
- **锁文件校验。** 能拦截以下情况：
  - 篡改历史文件
  - 删除历史文件
  - 重复版本号
  - 在锁定的最大版本之前插入迁移

  `.gitattributes -text` 能防止换行转换导致哈希漂移。
- **报告校验。** `verifyDatabaseReport` 对 skipped、todo、空 suite、缺失 suite 都会失败，并按绝对路径精确匹配。
- **schema 对比。** 已过滤 `\restrict`/`\unrestrict` 行。fresh 与 seeded 两侧的 bootstrap 对称。

**可以顺手改、但不阻断的小问题：**
- `pg_dump` 失败时，`execFileSync` 的错误信息会把 `--dbname` 中的临时密码打印到日志里。这个密码只用于本地回环上的临时集群，风险很低。可以改用 `PGPASSWORD` 环境变量传给子进程。
- 演练只在结束时检查 SIGINT。连按两次 Ctrl-C 时，第二次会走默认终止，本地可能残留集群。CI 不受影响，因为 runner 是临时的。

除上面的阻断项 1 和 Linux CI 门槛外，没有其他需要阻断合并的发现。